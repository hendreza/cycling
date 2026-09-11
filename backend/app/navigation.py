"""Turn cues at road joins and OsmAnd calculated-route GPX, from the saved road geometry.

No off-road connectors or phone-side route calculation are needed. Roundabout exit
numbers are deliberately not inferred from an incomplete road graph.
"""

from math import atan2, cos, degrees, radians, sin
from xml.etree.ElementTree import Element, SubElement, tostring
from .routing import km
from .timing import DEFAULT_SPEED_KMH


def bearing(a, b):
    lon1, lat1, lon2, lat2 = map(radians, (*a, *b))
    return degrees(
        atan2(
            sin(lon2 - lon1) * cos(lat2),
            cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(lon2 - lon1),
        )
    )


def tangent(points, end=False):
    ordered = list(reversed(points)) if end else points
    reference = ordered[-1]
    for point in ordered[1:]:
        reference = point
        if km(ordered[0], point) * 1000 >= 8:
            break
    return bearing(reference, ordered[0]) if end else bearing(ordered[0], reference)


def physical_uturn(previous, following):
    """Detect an immediate road reversal, including joins between different OSM ways."""
    edge, reverse = previous
    nxt, backwards = following
    if edge.id == nxt.id and reverse != backwards:
        return True
    arrival = (edge.bearings[0] + 180) % 360 if reverse else edge.bearings[1]
    departure = (nxt.bearings[1] + 180) % 360 if backwards else nxt.bearings[0]
    return abs((departure - arrival + 180) % 360 - 180) >= 160


def turn(angle):
    if abs(angle) >= 160:
        return "TU", "Make a U-turn"
    side = "right" if angle > 0 else "left"
    if abs(angle) >= 120:
        return ("TSHR" if angle > 0 else "TSHL"), f"Turn sharply {side}"
    if abs(angle) >= 45:
        return ("TR" if angle > 0 else "TL"), f"Turn {side}"
    if abs(angle) >= 25:
        return ("TSLR" if angle > 0 else "TSLL"), f"Bear {side}"
    return "C", "Continue"


def navigation(path, plan):
    segments, cues = [], []
    index, distance = 0, 0.0
    previous = None
    speed = (plan.rider_speed_kmh or DEFAULT_SPEED_KMH[plan.profile]) / 3.6
    roundabouts = False
    for edge, reverse in path:
        points = list(reversed(edge.points)) if reverse else list(edge.points)
        name = edge.tags.get("name", "unnamed road")
        circle = edge.tags.get("junction") == "roundabout"
        roundabouts |= circle
        angle, code, instruction = 0, "C", f"Start on {name}"
        announce = previous is None
        if previous:
            old_points, old_tags = previous
            angle = (tangent(points) - tangent(old_points, end=True) + 180) % 360 - 180
            code, action = turn(angle)
            instruction = f"{action} onto {name}"
            announce = abs(angle) >= 25 or name != old_tags.get("name", "unnamed road")
            if circle:
                announce = old_tags.get("junction") != "roundabout"
                code, instruction = "C", "Enter roundabout; follow the highlighted track"
            elif old_tags.get("junction") == "roundabout":
                announce = True
                instruction = f"Exit roundabout onto {name}; follow the highlighted track"
        segment = {
            "index": index,
            "start_node": edge.b if reverse else edge.a,
            "end_node": edge.a if reverse else edge.b,
            "count": len(points),
            "way_id": edge.way,
            "name": name,
            "tags": edge.tags,
            "distance_m": round(edge.length * 1000, 3),
            "seconds": round(edge.length * 1000 / speed, 3),
            "speed": round(speed, 4),
        }
        if announce:
            segment.update(turn=code, angle=round(angle, 2))
            cues.append(
                {
                    "index": index,
                    "distance_m": round(distance, 1),
                    "instruction": instruction,
                    "turn": code,
                }
            )
        segments.append(segment)
        index += len(points) - 1
        distance += edge.length * 1000
        previous = points, edge.tags
    cues.append(
        {
            "index": index,
            "distance_m": round(distance, 1),
            "instruction": "Finish lap at the start"
            if plan.mode == "loop"
            else "Arrive at destination",
            "turn": "finish",
        }
    )
    joins = list(zip(path, path[1:] + (path[:1] if plan.mode == "loop" else [])))
    uturns = sum(physical_uturn(a, b) for a, b in joins)
    return {
        "physical_uturns_per_lap": uturns,
        "version": 1,
        "segments": segments,
        "cues": cues,
        "roundabouts_need_review": roundabouts,
    }


def gpx(route, osmand=False, one_lap=False, speed_kmh=None):
    root = Element(
        "gpx",
        version="1.1",
        creator="Verge Centurion OSM planner",
        xmlns="http://www.topografix.com/GPX/1/1",
    )
    meta = SubElement(root, "metadata")
    SubElement(meta, "name").text = route["name"]
    SubElement(
        meta, "desc"
    ).text = f"OpenStreetMap data {route['data_timestamp']}. Access and conditions are not field-verified. © OpenStreetMap contributors, ODbL."
    SubElement(meta, "link", href="https://www.openstreetmap.org/copyright")
    coords = route["coordinates"]
    laps = 1 if one_lap else route.get("laps", 1)
    nav = route.get("navigation")
    if osmand and not nav:
        raise ValueError("Calculate this route again to add turn information.")
    if osmand:
        # GPX schema order is metadata, waypoints, routes, tracks.
        for lap in range(laps):
            rte = SubElement(root, "rte")
            SubElement(rte, "name").text = f"Lap {lap + 1}"
            for index in (0, len(coords) - 1):
                lon, lat = coords[index]
                point = SubElement(rte, "rtept", lat=str(lat), lon=str(lon))
                ext = SubElement(point, "extensions")
                SubElement(ext, "profile").text = "bicycle"
                SubElement(ext, "trkpt_idx").text = str(index)
    track = SubElement(root, "trk")
    SubElement(track, "name").text = route["name"]
    SubElement(
        track, "desc"
    ).text = f"{laps} laps, each {route.get('lap_distance', route['distance'])} km. Each track segment is one lap."
    for _ in range(laps):
        segment = SubElement(track, "trkseg")
        for lon, lat in coords:
            SubElement(segment, "trkpt", lat=str(lat), lon=str(lon))
        if osmand:
            ext = SubElement(segment, "extensions")
            routing = SubElement(ext, "route")
            types = SubElement(ext, "types")
            dictionary = {}

            def type_index(k, v):
                key = (k, v)
                if key not in dictionary:
                    dictionary[key] = len(dictionary)
                    SubElement(types, "type", t=k, v=v)
                return dictionary[key]

            for item in nav["segments"]:
                attrs = {
                    "id": str(item["way_id"]),
                    "length": str(item["count"]),
                    "startTrkptIdx": str(item["index"]),
                    "segmentTime": str(
                        round(item["distance_m"] / (speed_kmh / 3.6), 3)
                        if speed_kmh
                        else item["seconds"]
                    ),
                    "speed": str(round(speed_kmh / 3.6, 4) if speed_kmh else item["speed"]),
                    "types": ",".join(
                        str(type_index(k, v)) for k, v in item["tags"].items() if k != "name"
                    ),
                    "names": str(type_index("name", item["name"])),
                }
                if "turn" in item:
                    attrs.update(turnType=item["turn"], turnAngle=str(item["angle"]))
                SubElement(routing, "segment", **attrs)
    return tostring(root, encoding="utf-8", xml_declaration=True)
