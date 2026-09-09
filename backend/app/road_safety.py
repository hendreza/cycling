"""Explainable mapped-road assessment, not measured crash or personal-security risk."""

from math import isfinite
from shapely import STRtree
from shapely.geometry import LineString, Point, mapping
from .routing import km

MODEL = "mapped-roads-v1"
MAJOR_CLASSES = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
}
CRITICAL_CLASSES = {"motorway", "motorway_link", "trunk", "trunk_link"}
CONNECTORS = {"tertiary", "tertiary_link", "unclassified"}


def mapped_speed(tags):
    values = []
    for key in ("maxspeed", "maxspeed:forward", "maxspeed:backward"):
        for raw in str(tags.get(key, "")).lower().split(";"):
            try:
                value = float(raw.replace("mph", "").replace("km/h", "").strip()) * (
                    1.609344 if "mph" in raw else 1
                )
                if isfinite(value) and value > 0:
                    values.append(value)
            except ValueError:
                pass
    return max(values) if values else None


def major_road(tags):
    return tags.get("highway") in MAJOR_CLASSES or (mapped_speed(tags) or 0) > 60


def grade(tags):
    structure = tags.get("bridge") not in {None, "no"} or tags.get("tunnel") not in {None, "no"}
    raw = tags.get("layer")
    if raw is not None:
        try:
            value = float(raw)
            return (value if isfinite(value) else None), structure
        except ValueError:
            return None, structure
    return (
        1
        if tags.get("bridge") not in {None, "no"}
        else -1
        if tags.get("tunnel") not in {None, "no"}
        else 0
    ), structure


def separated(a, b, shared_node=False):
    if shared_node:
        return False
    ga, sa = grade(a)
    gb, sb = grade(b)
    return ga is not None and gb is not None and ga != gb and (sa or sb)


class RoadBarriers:
    def __init__(self, ways, nodes):
        self.lines = []
        self.roads = []
        self.cache = {}
        for way in ways:
            if not major_road(way["tags"]):
                continue
            sequence = []
            for node in [*way["nodes"], None]:
                if node in nodes:
                    sequence.append(node)
                else:
                    if len(sequence) > 1:
                        self.lines.append(LineString([nodes[n] for n in sequence]))
                        self.roads.append(
                            {"way": way["id"], "tags": way["tags"], "nodes": set(sequence)}
                        )
                    sequence = []
        self.tree = STRtree(self.lines)

    def contacts(self, edge):
        if edge.id in self.cache:
            return self.cache[edge.id]
        result = []
        line = LineString(edge.points)
        for index in self.tree.query(line, predicate="intersects"):
            road = self.roads[index]
            if road["way"] == edge.way:
                continue
            shared = edge.a in road["nodes"] or edge.b in road["nodes"]
            apart = separated(edge.tags, road["tags"], shared)
            intersection = line.intersection(self.lines[index])
            geometries = (
                list(intersection.geoms) if hasattr(intersection, "geoms") else [intersection]
            )
            for geom in geometries:
                if geom.geom_type == "Point":
                    point = (geom.x, geom.y)
                    endpoint = (
                        edge.a
                        if km(point, edge.points[0]) * 1000 < 0.05
                        else edge.b
                        if km(point, edge.points[-1]) * 1000 < 0.05
                        else None
                    )
                    ambiguous = False
                else:
                    point = edge.points[0]
                    endpoint = None
                    ambiguous = True
                result.append(
                    {
                        "coordinates": point,
                        "node": endpoint,
                        "name": road["tags"].get("name", road["tags"].get("ref", "Major road")),
                        "way_id": road["way"],
                        "separated": apart and not ambiguous,
                        "critical": road["tags"].get("highway") in CRITICAL_CLASSES,
                        "ambiguous": ambiguous,
                    }
                )
        if ":snap" not in edge.id:
            self.cache[edge.id] = result
        return result

    def features(self):
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": mapping(line),
                    "properties": {
                        "name": road["tags"].get("name", road["tags"].get("ref", "Major road")),
                        "way_id": road["way"],
                        "highway": road["tags"].get("highway"),
                        "maxspeed": mapped_speed(road["tags"]),
                    },
                }
                for line, road in zip(self.lines, self.roads)
            ],
        }


def assessment(path, barriers, timestamp, laps=1, hazards=()):
    length = sum(e.length for e, _ in path)

    def share(predicate):
        return sum(e.length for e, _ in path if predicate(e.tags)) / length * 100

    percentages = {
        "major_roads": share(major_road),
        "higher_speed_roads": share(lambda t: (mapped_speed(t) or 0) > 60),
        "connector_roads": share(lambda t: t.get("highway") in CONNECTORS),
        "unknown_surface": share(lambda t: not t.get("surface")),
        "inferred_access": share(lambda t: not t.get("access") and not t.get("bicycle")),
        "unknown_speed": share(
            lambda t: (
                mapped_speed(t) is None
                and t.get("highway") not in {"cycleway", "path", "footway", "bridleway"}
            )
        ),
        "poor_surface": share(
            lambda t: t.get("smoothness") in {"bad", "very_bad", "horrible", "very_horrible"}
        ),
    }
    crossings = {}
    bridges = {}
    visits = set()
    travelled = 0
    for edge, reverse in path:
        for contact in barriers.contacts(edge):
            key = tuple(round(c, 6) for c in contact["coordinates"])
            target = bridges if contact["separated"] else crossings
            entry = target.setdefault(key, {"coordinates": contact["coordinates"], "names": set()})
            entry["names"].add(contact["name"])
            if not contact["separated"]:
                line = LineString(tuple(reversed(edge.points)) if reverse else edge.points)
                offset = line.project(Point(contact["coordinates"]), normalized=True) * edge.length
                visits.add((key, round((travelled + offset) * 1000, 2)))
        travelled += edge.length
    # Two edges meeting at a junction are one encounter. A later return to the
    # same junction is another. At loop closure count the arrival once per lap.
    for key, position in tuple(visits):
        if position == 0 and (key, round(length * 1000, 2)) in visits:
            visits.remove((key, position))
    junctions = [
        {"coordinates": v["coordinates"], "names": sorted(v["names"])} for v in crossings.values()
    ]
    ways = {e.way for e, _ in path}
    issues = [h for h in hazards if h["way_id"] in ways]
    # Public heuristic weights; changes require a model version change. Missing
    # observations lower the score instead of being counted as safe evidence.
    factors = [
        (
            "Major-road junctions",
            min(35, len(junctions) * 8),
            f"{len(junctions)} mapped contacts per lap",
        ),
        (
            "Major roads",
            percentages["major_roads"] * 0.35,
            f"{percentages['major_roads']:.1f}% of the loop",
        ),
        (
            "Mapped speeds above 60 km/h",
            percentages["higher_speed_roads"] * 0.15,
            f"{percentages['higher_speed_roads']:.1f}% of the loop",
        ),
        (
            "Connector roads",
            percentages["connector_roads"] * 0.15,
            f"{percentages['connector_roads']:.1f}% of the loop",
        ),
        (
            "Unknown surface",
            percentages["unknown_surface"] * 0.15,
            f"{percentages['unknown_surface']:.1f}% missing surface tags",
        ),
        (
            "Inferred access",
            percentages["inferred_access"] * 0.1,
            f"{percentages['inferred_access']:.1f}% without explicit access/bicycle tags",
        ),
        (
            "Unknown speed",
            percentages["unknown_speed"] * 0.1,
            f"{percentages['unknown_speed']:.1f}% missing numeric speed tags",
        ),
        (
            "Poor mapped surface",
            percentages["poor_surface"] * 0.2,
            f"{percentages['poor_surface']:.1f}% tagged poor smoothness",
        ),
        (
            "Local road reports",
            min(30, len({h["way_id"] for h in issues}) * 10),
            f"{len(issues)} active adverse reports on this loop",
        ),
    ]
    deductions = sum(p for _, p, _ in factors)
    return {
        "model": MODEL,
        "score": round(max(0, 100 - deductions), 1),
        "confidence": "Limited · map data only",
        "data_timestamp": timestamp,
        "factors": [
            {"label": label, "deduction": round(p, 2), "detail": detail}
            for label, p, detail in factors
        ],
        "coverage": {k: round(v, 1) for k, v in percentages.items()},
        "major_junctions": junctions,
        "major_junctions_per_lap": len(junctions),
        "major_junction_visits_per_lap": len(visits),
        "major_junction_visits": len(visits) * laps,
        "separated_crossings": len(bridges),
        "reports": issues,
        "unknowns": [
            "Live traffic",
            "Security/crime conditions",
            "Unmapped gates and closures",
            "Field verification",
        ],
        "basis": "Heuristic based on mapped road class, junctions, speed, surface, access and local reports. No crash probability or verified safety rating.",
    }


def safety_rank(route):
    safety = route["safety"]
    # Safety estimate strictly precedes laps; no weighted trade-off buys a worse
    # mapped score just to save laps. Distance fit is the next tie-breaker.
    return (
        -safety["score"],
        route["laps"],
        route.get("distance_over_target_m", 0),
        route["distance_m"],
    )
