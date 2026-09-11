"""Locally cached OSM import and directed routing. No fabricated road attributes."""

import json
import os
import threading
from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import cached_property
from itertools import count
from datetime import datetime, timezone
from heapq import heappop, heappush
from math import atan2, ceil, cos, pi, radians
from pathlib import Path
import httpx
from .routing import BOUNDS, inside, km
from .timing import estimate_time
from .navigation import navigation, tangent, physical_uturn
from .road_safety import RoadBarriers, assessment, major_road, safety_rank
from .neighbourhoods import route_areas
from .areas import locality, contains_path
from .loop_search import search_paths, fingerprint, path_length
from .access_zones import build_zones
from .access_blocks import AccessMask
from shapely.geometry import LineString, Point

PUBLIC = {"yes", "designated", "permissive", "official"}
CLOSED = {
    "no",
    "private",
    "customers",
    "destination",
    "delivery",
    "agricultural",
    "forestry",
    "permit",
    "unknown",
    "residents",
}
ROADS = {
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "unclassified",
    "residential",
    "living_street",
}
PAVED = {
    "asphalt",
    "paved",
    "concrete",
    "concrete:plates",
    "concrete:lanes",
    "paving_stones",
    "chipseal",
}
GRAVEL = {"gravel", "fine_gravel", "compacted", "pebblestone"}
BARRIERS = {
    "gate",
    "lift_gate",
    "swing_gate",
    "cycle_barrier",
    "stile",
    "turnstile",
    "fence",
    "wall",
    "block",
    "jersey_barrier",
    "chain",
}
POLICY_VERSION = "osm-conservative-5"
_import_lock = threading.Lock()
_graph_lock = threading.Lock()
_state = {"updating": False, "error": None}
_cached = None
_cached_key = None


def data_path():
    return Path(
        os.getenv(
            "OSM_DATA_PATH", str(Path(__file__).resolve().parents[2] / "data/centurion-osm.json")
        )
    )


def download_extract():
    if not _import_lock.acquire(blocking=False):
        return
    _state.update(updating=True, error=None)
    try:
        west, south, east, north = BOUNDS
        box = f"{south},{west},{north},{east}"
        query = f'[out:json][timeout:120];way["highway"]({box});(._;>;);out body;relation["type"="restriction"]({box});out body;'
        endpoint = os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
        with httpx.Client(
            timeout=150,
            headers={"User-Agent": "VeldCenturionPersonalPilot/0.2 (local cycling road extract)"},
        ) as client:
            response = client.post(endpoint, data={"data": query})
            response.raise_for_status()
            payload = response.json()
            if payload.get("remark") or not payload.get("elements"):
                raise ValueError("Incomplete road response.")
            zones_query = f'[out:json][timeout:90];(way["landuse"="residential"]({box});relation["landuse"="residential"]({box}););out geom;'
            zones_response = client.post(endpoint, data={"data": zones_query})
            zones_response.raise_for_status()
            zones = zones_response.json()
            if zones.get("remark") or not zones.get("elements"):
                raise ValueError("Incomplete residential boundary response.")
            payload["veld_access_zones"] = zones["elements"]
            payload["veld_zones_timestamp"] = zones.get("osm3s", {}).get("timestamp_osm_base")
        if payload.get("remark") or not payload.get("elements"):
            raise ValueError("Incomplete OSM response. Existing data was preserved.")
        payload["veld_imported_at"] = datetime.now(timezone.utc).isoformat()
        # Parse before replacing the last working extract.
        graph = Graph(payload)
        if len(graph.edges) < 100:
            raise ValueError("Downloaded road network is unexpectedly small.")
        path = data_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload))
        temporary.replace(path)
    except Exception as exc:
        _state["error"] = f"Road refresh failed: {type(exc).__name__}. Existing data was preserved."
    finally:
        _state["updating"] = False
        _import_lock.release()


@dataclass(frozen=True)
class Edge:
    id: str
    way: int
    a: int
    b: int
    points: tuple
    length: float
    tags: dict

    @cached_property
    def bearings(self):
        return tangent(self.points), tangent(self.points, end=True)


class RoutingNetwork(defaultdict):
    """Request-local coordinates/edges: projecting a start must not mutate the cached graph."""

    def __init__(self, nodes):
        super().__init__(list)
        self.nodes = dict(nodes)
        self.next_id = -1
        self.barrier_nodes = set()
        self.turns = {}


def project_on_segment(point, a, b):
    # Local equirectangular projection; the final acceptance distance uses geodesic km().
    scale = cos(radians(point[1]))
    dx, dy = (b[0] - a[0]) * scale, b[1] - a[1]
    denominator = dx * dx + dy * dy
    t = (
        0
        if denominator == 0
        else max(
            0, min(1, (((point[0] - a[0]) * scale) * dx + (point[1] - a[1]) * dy) / denominator)
        )
    )
    return (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))


def general_access(tags):
    # Conservatively retain private estate exclusions even when bicycle=designated is present.
    if (tags.get("access") is not None and tags["access"] not in PUBLIC) or (
        tags.get("bicycle") is not None and tags["bicycle"] not in PUBLIC
    ):
        return False
    if tags.get("access") in CLOSED or tags.get("bicycle") in CLOSED | {"dismount", "use_sidepath"}:
        return False
    if tags.get("vehicle") in CLOSED and tags.get("bicycle") not in PUBLIC:
        return False
    if any(
        k.endswith(":conditional")
        for k in tags
        if k
        in (
            "access:conditional",
            "bicycle:conditional",
            "vehicle:conditional",
            "oneway:conditional",
            "oneway:bicycle:conditional",
        )
    ):
        return False  # time-dependent permissions require a schedule evaluator
    if tags.get("opening_hours") not in (None, "24/7"):
        return False
    if tags.get("impassable") == "yes" or tags.get("smoothness") == "impassable":
        return False
    return True


def node_allowed(tags):
    if not general_access(tags) or tags.get("locked") == "yes":
        return False
    if tags.get("barrier") and tags["barrier"] not in {
        "bollard",
        "entrance",
        "cattle_grid",
        "kerb",
    }:
        return tags.get("bicycle") in PUBLIC and tags.get("barrier") not in {
            "fence",
            "wall",
            "stile",
            "turnstile",
        }
    return True


def eligible(tags, p):
    h = tags.get("highway", "")
    if p.avoid_main_roads and major_road(tags):
        return False
    if not general_access(tags) or h not in ROADS | {
        "cycleway",
        "service",
        "track",
        "path",
        "footway",
        "bridleway",
    }:
        return False
    if tags.get("motorroad") == "yes" or tags.get("construction") or tags.get("proposed"):
        return False
    if tags.get("fee") == "yes" and not p.paid:
        return False
    if (
        h in {"service", "track", "path", "footway", "bridleway"}
        and tags.get("bicycle") not in PUBLIC
        and tags.get("access") not in PUBLIC
    ):
        return False
    if tags.get("service") in {"driveway", "parking_aisle", "emergency_access"}:
        return False
    surface = tags.get("surface", "unknown")
    if p.profile == "road":
        if surface != "unknown" and surface not in PAVED:
            return False
        if h in {"track", "path", "footway", "bridleway"} and surface not in PAVED:
            return False
    if (
        p.profile == "gravel"
        and h in {"path", "bridleway", "footway"}
        and surface not in PAVED | GRAVEL
    ):
        return False
    scale = tags.get("mtb:scale")
    if scale is not None:
        try:
            if int(scale) > (p.difficulty if p.profile == "mtb" else 0):
                return False
        except ValueError:
            return False
    elif p.profile == "mtb" and h in {"path", "bridleway"} and surface not in PAVED | GRAVEL:
        return False
    return True


def edge_weight(e, p):
    if p.preference == "direct":
        return e.length
    h = e.tags.get("highway")
    factor = {
        "primary": 3.5,
        "primary_link": 3.5,
        "secondary": 2.6,
        "secondary_link": 2.6,
        "tertiary": 1.7,
        "tertiary_link": 1.7,
        "residential": 1.05,
        "cycleway": 0.8,
        "living_street": 1,
    }.get(h, 1.3)
    if p.preference == "balanced":
        factor = 1 + (factor - 1) * 0.45
    if e.tags.get("cycleway") in {"track", "lane", "opposite_lane", "opposite_track"}:
        factor = max(0.8, factor * 0.8)
    return e.length * factor


class Graph:
    def __init__(self, payload):
        self.timestamp = payload.get("osm3s", {}).get("timestamp_osm_base", "unknown")
        self.imported_at = payload.get("veld_imported_at")
        self.zone_tree, self.zone_features = build_zones(payload.get("veld_access_zones", []))
        self.zones_timestamp = payload.get("veld_zones_timestamp")
        self.zone_excluded_edges = 0
        elements = payload["elements"]
        self.nodes = {
            e["id"]: (e["lon"], e["lat"])
            for e in elements
            if e["type"] == "node" and inside((e["lon"], e["lat"]))
        }
        self.node_tags = {
            e["id"]: e.get("tags", {}) for e in elements if e["type"] == "node" and e.get("tags")
        }
        ways = [e for e in elements if e["type"] == "way" and e.get("tags", {}).get("highway")]
        self.way_tags = {w["id"]: w["tags"] for w in ways}
        counts = Counter(n for w in ways for n in set(w["nodes"]))
        self.rules = defaultdict(list)
        self.blocked_ways = set()
        for r in elements:
            if r["type"] != "relation" or r.get("tags", {}).get("type") != "restriction":
                continue
            tags = r.get("tags", {})
            if "bicycle" in tags.get("except", "").split(";"):
                continue
            rule = tags.get("restriction:bicycle", tags.get("restriction", ""))
            frm = [
                m["ref"] for m in r.get("members", []) if m["role"] == "from" and m["type"] == "way"
            ]
            to = [
                m["ref"] for m in r.get("members", []) if m["role"] == "to" and m["type"] == "way"
            ]
            via = [
                m["ref"] for m in r.get("members", []) if m["role"] == "via" and m["type"] == "node"
            ]
            if not frm or not to:
                continue
            if not via or any("conditional" in key for key in tags):
                self.blocked_ways.update(frm)  # conservative until via-way/schedule support
            else:
                for f in frm:
                    self.rules[(via[0], f)].append((rule, set(to)))
        self.edges = []
        for w in ways:
            tags = w["tags"]
            sequence = []
            ordinal = 0
            for n in w["nodes"]:
                if n not in self.nodes:
                    sequence = []
                    continue
                sequence.append(n)
                cut = counts[n] > 1 or n in self.node_tags or n == w["nodes"][-1]
                if cut and len(sequence) > 1:
                    a, b = sequence[0], sequence[-1]
                    if (
                        a != b
                        and node_allowed(self.node_tags.get(a, {}))
                        and node_allowed(self.node_tags.get(b, {}))
                    ):
                        coords = tuple(self.nodes[x] for x in sequence)
                        length = sum(km(x, y) for x, y in zip(coords, coords[1:]))
                        if length > 0:
                            self.edges.append(
                                Edge(
                                    f"osm-{w['id']}-{ordinal}", w["id"], a, b, coords, length, tags
                                )
                            )
                    ordinal += 1
                    sequence = [n]
        retained = []
        for edge in self.edges:
            if len(self.zone_tree.query(LineString(edge.points), predicate="intersects")):
                self.zone_excluded_edges += 1
            else:
                retained.append(edge)
        self.edges = retained
        self.way_count = len(ways)
        self.barriers = RoadBarriers(ways, self.nodes)

    def adjacency(self, p, hazards=()):
        graph = RoutingNetwork(self.nodes)
        area = locality(p)
        reported = {h["way_id"] for h in hazards if h["category"] != "personal-access-block"}
        mask = AccessMask([h for h in hazards if h["category"] == "personal-access-block"])
        forbidden = set(p.avoid_ways) | self.blocked_ways
        for e in self.edges:
            if (
                e.way in forbidden
                or not eligible(e.tags, p)
                or not contains_path(area, e.points)
                or mask.matches(e.points)
            ):
                continue
            # A local cell ends at major roads, not administrative boundaries.
            contacts = self.barriers.contacts(e)
            blocked = [
                c for c in contacts if not c["separated"] and (p.stay_local or c["critical"])
            ]
            if p.stay_local and major_road(e.tags):
                continue
            if any(c["node"] is None for c in blocked):
                continue
            graph.barrier_nodes.update(c["node"] for c in blocked)
            oneway = e.tags.get(
                "oneway:bicycle",
                e.tags.get("oneway", "yes" if e.tags.get("junction") == "roundabout" else "no"),
            )
            cost = edge_weight(e, p) * (12 if e.way in reported else 1)
            if oneway != "-1" and e.tags.get("bicycle:forward", "yes") in PUBLIC:
                graph[e.a].append((e.b, e, False, cost))
            if (
                oneway not in {"yes", "1", "true"}
                and e.tags.get("bicycle:backward", "yes") in PUBLIC
            ):
                graph[e.b].append((e.a, e, True, cost))
        return graph

    def snap(self, point, graph):
        if len(self.zone_tree.query(Point(point), predicate="intersects")):
            raise ValueError(
                "This point is in a mapped estate or private/gated residential area. Select a public road outside the excluded boundary."
            )
        edges = {edge.id: edge for neighbours in graph.values() for _, edge, _, _ in neighbours}
        if not edges:
            raise ValueError("No roads match these choices.")
        best = None
        distance = float("inf")
        for edge in edges.values():
            for i, (a, b) in enumerate(zip(edge.points, edge.points[1:])):
                # A generous local box avoids projecting distant road segments.
                if not (
                    min(a[0], b[0]) - 0.00025 <= point[0] <= max(a[0], b[0]) + 0.00025
                    and min(a[1], b[1]) - 0.0002 <= point[1] <= max(a[1], b[1]) + 0.0002
                ):
                    continue
                projected = project_on_segment(point, a, b)
                gap = km(point, projected) * 1000
                if gap < distance:
                    distance, best = gap, (edge, i, projected)
        if best is None or distance > 20:
            raise ValueError(
                "No eligible road within 20 m of your chosen point. Zoom in and select a public road, or improve your device location. The start will not be moved farther away."
            )
        edge, index, projected = best
        # Reuse exact endpoints; interior shape vertices still require an edge split.
        for node in (edge.a, edge.b):
            if (
                km(projected, graph.nodes[node]) * 1000 < 0.001
                and km(point, graph.nodes[node]) * 1000 <= 20
            ):
                if node in graph.barrier_nodes:
                    raise ValueError(
                        "This point is at a major-road junction. Choose a start on a side road away from the junction."
                    )
                return node, round(km(point, graph.nodes[node]) * 1000, 1)
        node = graph.next_id
        graph.next_id -= 1
        graph.nodes[node] = projected
        left_points = edge.points[: index + 1]
        if left_points[-1] != projected:
            left_points += (projected,)
        right_points = edge.points[index + 1 :]
        if right_points[0] != projected:
            right_points = (projected,) + right_points
        parts = [
            Edge(
                f"{edge.id}:snap{node}:{i}",
                edge.way,
                a,
                b,
                points,
                sum(km(x, y) for x, y in zip(points, points[1:])),
                edge.tags,
            )
            for i, (a, b, points) in enumerate(
                [(edge.a, node, left_points), (node, edge.b, right_points)]
            )
        ]
        # Split only directed arcs that already exist; do not introduce reverse access or connections at crossings.
        arcs = [
            (a, item)
            for a in {edge.a, edge.b}
            for item in graph.get(a, [])
            if item[1].id == edge.id
        ]
        for a in {edge.a, edge.b}:
            graph[a] = [item for item in graph.get(a, []) if item[1].id != edge.id]
        for _, (_, _, reverse, weight) in arcs:
            for part in parts:
                frm, to = (part.b, part.a) if reverse else (part.a, part.b)
                graph[frm].append((to, part, reverse, weight * part.length / edge.length))
        return node, round(distance, 1)

    def follows(self, previous, following):
        if previous is None or following is None:
            return True
        edge, reverse = previous
        nxt, backwards = following
        node = edge.a if reverse else edge.b
        return (
            node == (nxt.b if backwards else nxt.a)
            and self.turn_allowed(node, edge.way, nxt.way)
            and not physical_uturn(previous, following)
        )

    def shortest(
        self,
        start,
        end,
        graph,
        penalised=frozenset(),
        initial_way=0,
        final_way=None,
        initial_part=None,
        final_part=None,
    ):
        # Direction is part of the state. A way ID alone loses the distinction
        # between riding through a road and turning straight back along it.
        initial = (start, "", False)
        serial = count()
        queue = [(0, next(serial), initial)]
        best = {initial: 0}
        parent = {}
        incoming_parts = {initial: initial_part}

        def allowed(previous, following):
            if previous is None or following is None:
                return True
            key = (previous[0].id, previous[1], following[0].id, following[1])
            if key not in graph.turns:
                graph.turns[key] = self.follows(previous, following)
            return graph.turns[key]

        while queue:
            cost, _, state = heappop(queue)
            node = state[0]
            if cost > best[state]:
                continue
            incoming = incoming_parts[state]
            incoming_way = incoming[0].way if incoming else initial_way
            if (
                node == end
                and (final_way is None or self.turn_allowed(node, incoming_way, final_way))
                and allowed(incoming, final_part)
            ):
                path = []
                while state != initial:
                    previous, edge, reverse = parent[state]
                    path.append((edge, reverse))
                    state = previous
                return list(reversed(path)), cost
            if node in graph.barrier_nodes:
                continue
            for nxt, edge, reverse, weight in graph.get(node, []):
                part = (edge, reverse)
                if not self.turn_allowed(node, incoming_way, edge.way) or not allowed(
                    incoming, part
                ):
                    continue
                nxt_state = (nxt, edge.id, reverse)
                new = cost + weight * (8 if edge.id in penalised else 1)
                if new < best.get(nxt_state, float("inf")):
                    best[nxt_state] = new
                    parent[nxt_state] = (state, edge, reverse)
                    incoming_parts[nxt_state] = part
                    heappush(queue, (new, next(serial), nxt_state))
        return None

    def turn_allowed(self, node, frm, to):
        for rule, targets in self.rules.get((node, frm), []):
            if rule.startswith("no_") and to in targets:
                return False
            if rule.startswith("only_") and to not in targets:
                return False
        return True

    def reachable(self, start, graph):
        visited = {start}
        queue = [start]
        for node in queue:
            if node in graph.barrier_nodes:
                continue
            for nxt, _, _, _ in graph.get(node, []):
                if nxt not in visited and nxt not in graph.barrier_nodes:
                    visited.add(nxt)
                    queue.append(nxt)
        return visited

    def best_fit_candidates(self, p, hazards=()):
        search_plan = p.model_copy(update={"preference": "lower-risk"})
        graph = self.adjacency(search_plan, hazards)
        start, snap = self.snap(p.point("start"), graph)
        paths, reachable_count = search_paths(self, graph, start, p)
        candidates = []
        longest = max((path_length(path) for path in paths), default=0)
        for path in paths:
            length = path_length(path)
            laps = max(1, ceil((p.distance - 1e-8) / length)) if p.best_fit else p.laps
            if (p.best_fit and laps > p.max_laps) or length * laps > p.distance * (
                1 + p.distance_tolerance
            ):
                continue
            if length * laps < p.distance * (1 if p.best_fit else 1 - p.distance_tolerance):
                continue
            applied = p.model_copy(update={"laps": laps})
            route = self.describe(path, applied, snap, snap, hazards, detail=False)
            route["distance_over_target_m"] = round((length * laps - p.distance) * 1000)
            route["requested_distance"] = p.distance
            route["distance_difference_km"] = round(length * laps - p.distance, 2)
            if route["fingerprint"] not in p.exclude_routes:
                candidates.append((route, {e.id for e, _ in path}))
        return candidates, reachable_count, longest

    def best_fit_routes(self, p, hazards=()):
        candidates, connected_nodes, longest = self.best_fit_candidates(p, hazards)
        if not p.stay_local:
            # Widening the search must retain valid local options. Otherwise
            # changed distance/bearing samples can discard a better local loop.
            local, _, local_longest = self.best_fit_candidates(
                p.model_copy(update={"stay_local": True, "coverage": "local"}), hazards
            )
            longest = max(longest, local_longest)
            area = locality(p)
            for route, ids in local:
                if contains_path(area, route["coordinates"]):
                    route["locality"].update(kind=area["kind"], name=area["name"])
                    candidates.append((route, ids))
        candidates.sort(key=lambda item: safety_rank(item[0]))
        # Keep the top score as the recommendation, while exposing the useful
        # fewest-laps trade-off instead of three near-identical short loops.
        chosen = []

        def distinct(item):
            return not any(
                len(item[1] & previous) / max(1, len(item[1] | previous)) > 0.82
                for _, previous in chosen
            )

        if candidates:
            chosen.append(candidates[0])
            longer = sorted(candidates, key=lambda item: (item[0]["laps"], safety_rank(item[0])))
            for item in longer:
                if distinct(item):
                    chosen.append(item)
                    break
            for item in candidates:
                if len(chosen) >= 3:
                    break
                if distinct(item):
                    chosen.append(item)
        chosen.sort(key=lambda item: safety_rank(item[0]))
        for route, _ in chosen:
            self.enrich(route)
            route["selection"] = {
                "strategy": "best_fit" if p.best_fit else "fixed_laps",
                "priority": ["Mapped-road score", "Fewest laps", "Closest total above target"],
                "candidates_checked": len(candidates),
                "connected_nodes": connected_nodes,
                "exhaustive": False,
                "explanation": f"Mapped-road score {route['safety']['score']:g}/100, then {route['laps']} laps. {route['lap_distance']:g} km per lap; {route['distance']:g} km total.",
            }
        return {
            "routes": [r for r, _ in chosen],
            "limits": {
                "longest_loop_km": round(longest, 1),
                "minimum_laps": ceil(p.distance / longest) if longest else None,
                "max_laps": p.max_laps if p.best_fit else p.laps,
            },
            "demo": False,
            "source": "OpenStreetMap",
            "data_timestamp": self.timestamp,
            "message": (
                f"Best fit: mapped-road score first, then fewer laps. Totals meet your target within {p.distance_tolerance * 100:g}%."
                if p.best_fit
                else "Routes use your chosen lap count. Compare the actual totals with your target."
            )
            if chosen
            else "No complete-loop match fits these road and distance limits. Try a different start or distance. Road access and major-road restrictions were kept.",
        }

    def routes(self, p, hazards=()):
        if p.mode == "loop" and not p.via_points:
            return self.best_fit_routes(p, hazards)
        target_distance = p.distance / p.laps if p.mode == "loop" else p.distance
        graph = self.adjacency(p, hazards)
        start, snap_start = self.snap(p.point("start"), graph)
        destination, snap_end = (
            self.snap(p.point("destination"), graph) if p.mode == "point" else (start, snap_start)
        )
        if p.mode == "point" and start == destination:
            raise ValueError(
                "Both points snap to the same junction. Choose a different destination."
            )
        vias = []
        for point in p.via_points:
            area = locality(p)
            if not contains_path(area, [point, point]):
                raise ValueError("An editing point is outside your selected riding area.")
            node, gap = self.snap(point, graph)
            vias.append((node, gap))
        candidates = []
        seen = set()

        def add(path):
            if not path:
                return
            if (
                p.mode == "loop"
                and path[-1][0].points[0 if path[-1][1] else -1]
                != path[0][0].points[-1 if path[0][1] else 0]
            ):
                return
            joins = list(zip(path, path[1:] + (path[:1] if p.mode == "loop" else [])))
            if any(not self.follows(a, b) for a, b in joins):
                return
            length = sum(e.length for e, _ in path)
            if (
                p.mode == "loop"
                and not vias
                and abs(length - target_distance) > target_distance * 0.1
            ):
                return
            ids = {e.id for e, _ in path}
            unique = sum({e.id: e.length for e, _ in path}.values())
            if p.mode == "loop" and not vias and (length - unique) / length > 0.18:
                return
            signature = tuple(sorted(ids))
            if signature in seen:
                return
            seen.add(signature)
            candidates.append((path, length, sum(edge_weight(e, p) for e, _ in path)))

        if vias:
            # All projections happen before path search so later edge splits cannot invalidate a leg.
            path = []
            checkpoints = [start, *[node for node, _ in vias], destination]
            for i, (a, b) in enumerate(zip(checkpoints, checkpoints[1:])):
                found = self.shortest(
                    a,
                    b,
                    graph,
                    {edge.id for edge, _ in path},
                    initial_part=path[-1] if path else None,
                    final_part=path[0]
                    if path and p.mode == "loop" and i == len(checkpoints) - 2
                    else None,
                )
                if found is None:
                    raise ValueError(
                        "Cannot connect the editing points without a U-turn under the current area, direction and access limits. Move a point or undo the edit."
                    )
                path.extend(found[0])
            if sum(edge.length for edge, _ in path) * p.laps > p.distance * 2:
                raise ValueError(
                    "This edit would more than double the requested ride distance. Move a point or adjust the distance first."
                )
            add(path)
        elif p.mode == "point":
            penalties = set()
            baseline = None
            for _ in range(3):
                found = self.shortest(start, destination, graph, penalties)
                if not found:
                    break
                candidate_length = sum(edge.length for edge, _ in found[0])
                if baseline is None:
                    baseline = candidate_length
                if candidate_length <= baseline * 1.8:
                    add(found[0])
                penalties.update(e.id for e, _ in found[0])
        else:
            # Representative graph junctions in distance/bearing bins, bounded local CPU work.
            origin = graph.nodes[start]
            buckets = {}
            for n in graph:
                d = km(origin, graph.nodes[n])
                if not target_distance * 0.16 <= d <= target_distance * 0.39:
                    continue
                bearing = (
                    int(
                        (
                            (
                                atan2(graph.nodes[n][1] - origin[1], graph.nodes[n][0] - origin[0])
                                + pi
                            )
                            / (2 * pi)
                        )
                        * 12
                    )
                    % 12
                )
                ring = 0 if d < target_distance * 0.27 else 1
                target = target_distance * (0.22 if ring == 0 else 0.33)
                key = (bearing, ring)
                if key not in buckets or abs(d - target) < buckets[key][0]:
                    buckets[key] = (abs(d - target), n)
            for _, pivot in buckets.values():
                outbound = self.shortest(start, pivot, graph)
                if not outbound or not outbound[0]:
                    continue
                path = outbound[0]
                if sum(e.length for e, _ in path) > target_distance * 0.65:
                    continue
                inbound = self.shortest(
                    pivot,
                    start,
                    graph,
                    {e.id for e, _ in path},
                    initial_part=path[-1],
                    final_part=path[0],
                )
                if inbound:
                    add(path + inbound[0])
        assessed = [
            (
                self.describe(path, p, snap_start, snap_end, hazards, detail=False),
                {e.id for e, _ in path},
            )
            for path, _, _ in candidates
        ]
        assessed.sort(key=lambda item: safety_rank(item[0]))
        chosen = []
        for route, ids in assessed:
            if route["fingerprint"] in p.exclude_routes:
                continue
            if any(len(ids & prev) / max(1, len(ids | prev)) > 0.82 for _, prev in chosen):
                continue
            chosen.append((route, ids))
            if len(chosen) == 3:
                break
        for route, _ in chosen:
            self.enrich(route)
        return {
            "routes": [r for r, _ in chosen],
            "demo": False,
            "source": "OpenStreetMap",
            "data_timestamp": self.timestamp,
            "message": "Edited route calculated through every control point. Distance now reflects the edited roads."
            if chosen and vias
            else "Routes follow mapped roads. Review access, surface gaps and junctions before riding."
            if chosen
            else "No route fits this distance inside the selected limits. Increase laps for a shorter loop, or choose another local start. The area and road restrictions were kept.",
        }

    def enrich(self, route):
        route["local_areas"] = route_areas(route["coordinates"])
        groups = []
        for segment in route["navigation"]["segments"]:
            points = tuple(
                tuple(c)
                for c in route["coordinates"][
                    segment["index"] : segment["index"] + segment["count"]
                ]
            )
            edge = Edge(
                f"detail:snap:{segment['index']}",
                segment["way_id"],
                segment.get("start_node", -10000 - segment["index"]),
                segment.get("end_node", -20000 - segment["index"]),
                points,
                segment["distance_m"] / 1000,
                segment["tags"],
            )
            groups.append((edge, False))
        # Contacts were already checked for the complete route. Sections are
        # explanatory hints and retain the route's report evidence.
        route["sections"] = self.sections(
            groups,
            route["laps"],
            route["safety"]["reports"],
        )
        return route

    def sections(self, path, laps, hazards=()):
        groups = []
        for edge, reverse in path:
            if groups and groups[-1][0][0].way == edge.way:
                groups[-1].append((edge, reverse))
            else:
                groups.append([(edge, reverse)])
        sections = []
        index = 0
        for group in groups:
            count = 1 + sum(len(e.points) - 1 for e, _ in group)
            score = assessment(group, self.barriers, self.timestamp, laps, hazards)
            sections.append(
                {
                    "index": index,
                    "count": count,
                    "way_id": group[0][0].way,
                    "name": group[0][0].tags.get("name", "Unnamed road"),
                    "distance_m": round(sum(e.length for e, _ in group) * 1000),
                    "score": score["score"],
                    "concerns": [f["label"] for f in score["factors"] if f["deduction"] > 0],
                }
            )
            index += count - 1
        return sections

    def describe(self, path, p, snap_start, snap_end, hazards=(), detail=True):
        coords = []
        length = sum(e.length for e, _ in path)
        surfaces = defaultdict(float)
        roads = {}
        for e, reverse in path:
            points = list(reversed(e.points)) if reverse else list(e.points)
            coords.extend(points if not coords else points[1:])
            surface = e.tags.get("surface", "unknown")
            key = (
                "tar"
                if surface in PAVED
                else "gravel"
                if surface in GRAVEL
                else "unknown"
                if surface == "unknown"
                else "trail"
            )
            surfaces[key] += e.length
            if e.way not in roads:
                roads[e.way] = {
                    "way_id": e.way,
                    "name": e.tags.get(
                        "name", e.tags.get("highway", "Unnamed road").replace("_", " ")
                    ),
                    "highway": e.tags.get("highway"),
                    "surface": surface,
                    "access": e.tags.get("access", "not explicitly tagged"),
                    "bicycle": e.tags.get("bicycle", "not explicitly tagged"),
                    "maxspeed": e.tags.get("maxspeed"),
                    "distance": 0,
                    "url": f"https://www.openstreetmap.org/way/{e.way}",
                }
            roads[e.way]["distance"] += e.length
        for r in roads.values():
            r["distance"] = round(r["distance"], 2)
        major = (
            sum(
                e.length
                for e, _ in path
                if e.tags.get("highway")
                in {"primary", "primary_link", "secondary", "secondary_link"}
            )
            / length
            * 100
        )
        timing = estimate_time(length, p)
        area = locality(p)
        safety = assessment(path, self.barriers, self.timestamp, p.laps, hazards)
        junctions = safety["major_junctions"]
        return {
            "id": "",
            "fingerprint": fingerprint(coords),
            "name": f"{p.start.replace('-', ' ').title()} · {max(roads.values(), key=lambda r: r['distance'])['name']}",
            "locality": {
                "enforced": area is not None,
                "kind": area["kind"] if area else "coverage",
                "name": area["name"] if area else "Centurion",
                "max_distance_from_start_km": round(
                    max(km(p.point("start"), c) for c in coords), 3
                ),
                "boundary_source": area["info"]["source"]
                if area and area["kind"] == "boundary"
                else None,
            },
            "safety": safety,
            "local_areas": route_areas(coords) if detail else [],
            "sections": self.sections(path, p.laps, hazards) if detail else [],
            "best_fit": p.best_fit and not p.via_points,
            "navigation": navigation(path, p),
            "via_points": p.via_points,
            "edited": bool(p.via_points),
            "major_road_junctions": junctions,
            "avoid_main_roads": p.avoid_main_roads,
            "start_road": path[0][0].tags.get("name", "Unnamed road"),
            "requested_start": p.point("start"),
            "distance": round(length * p.laps, 1),
            "distance_m": round(length * p.laps * 1000),
            "laps": p.laps,
            "lap_distance": round(length, 1),
            "lap_distance_m": round(length * 1000),
            **timing,
            "elevation": None,
            "score": None,
            "traffic": None,
            "confidence": "Low",
            "surface": {k: round(v / length * 100, 1) for k, v in surfaces.items()},
            "access": ["OSM access tags; not field-verified"],
            "difficulty": None,
            "weakest_score": None,
            "penalty": None,
            "coordinates": coords,
            "segment_ids": [f"osm-way-{w}" for w in roads],
            "roads": list(roads.values()),
            "major_road_percent": round(major, 1),
            "snap_start_m": snap_start,
            "snap_limit_m": 20,
            "start_accuracy_m": p.start_accuracy_m,
            "snap_end_m": snap_end,
            "demo": False,
            "data_timestamp": self.timestamp,
            "policy_version": POLICY_VERSION,
            "estate_zones_checked": len(self.zone_features),
            "access_data_timestamp": self.zones_timestamp,
            "explanations": [
                f"{major:.0f}% primary/secondary roads by distance; this is road classification, not measured traffic.",
                f"{surfaces.get('unknown', 0) / length * 100:.0f}% of this route has no mapped surface. Road suitability is partly inferred from road class.",
                "Mapped estate/private-area boundaries, restricted roads, unresolved gates and prohibited cycling are excluded.",
                "No measured safety score, live traffic or elevation is available. OSM can miss gates, closures and access restrictions.",
            ],
            "warnings": [
                "Access is inferred from mapped road classes where explicit tags are absent. It has not been independently verified.",
                "Start/end project onto eligible mapped roads within 20 m; review the highlighted points. No off-road connector is included.",
            ],
        }


def get_graph():
    global _cached, _cached_key
    path = data_path()
    if not path.exists():
        raise FileNotFoundError("Road data is not downloaded yet. Use Download / refresh roads.")
    stat = path.stat()
    key = (str(path), stat.st_mtime_ns, stat.st_size)
    with _graph_lock:
        if key != _cached_key:
            _cached = Graph(json.loads(path.read_text()))
            _cached_key = key
        return _cached


def status():
    result = {
        **_state,
        "available": data_path().exists(),
        "bounds": BOUNDS,
        "source": "OpenStreetMap",
        "policy_version": POLICY_VERSION,
    }
    if result["available"]:
        graph = get_graph()
        result.update(
            timestamp=graph.timestamp,
            ways=graph.way_count,
            edges=len(graph.edges),
            nodes=len(graph.nodes),
            excluded_estates=len(graph.zone_features),
            estate_excluded_edges=graph.zone_excluded_edges,
            access_timestamp=graph.zones_timestamp,
        )
    return result
