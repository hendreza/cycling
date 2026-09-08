"""Downloadable source data and a focused field-check worksheet, not offline map tiles."""

import csv
import io
import json
from zipfile import ZipFile, ZIP_DEFLATED
from shapely.geometry import LineString, Point, mapping, shape
from .areas import get_area, public_area
from .routing import Plan
from .areas import contains_path
from . import osm


def area_data(area_id):
    area = get_area(area_id)
    if not area:
        raise ValueError("Download this area boundary first.")
    info, polygon = area
    graph = osm.get_graph()
    payload = json.loads(osm.data_path().read_text())
    nodes = {e["id"]: e for e in payload["elements"] if e["type"] == "node"}
    roads, raw_ways, used_nodes = [], [], set()
    for way in payload["elements"]:
        if way["type"] != "way" or not way.get("tags", {}).get("highway"):
            continue
        points = [(nodes[n]["lon"], nodes[n]["lat"]) for n in way["nodes"] if n in nodes]
        if len(points) < 2:
            continue
        line = LineString(points)
        if not polygon.intersects(line):
            continue
        clipped = polygon.intersection(line)
        if clipped.is_empty or clipped.geom_type not in {"LineString", "MultiLineString"}:
            continue
        roads.append(
            {
                "type": "Feature",
                "geometry": mapping(clipped),
                "properties": {"osm_way_id": way["id"], **way.get("tags", {})},
            }
        )
        raw_ways.append(way)
        used_nodes.update(way["nodes"])
    node_features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [n["lon"], n["lat"]]},
            "properties": {"osm_node_id": n["id"], **n["tags"]},
        }
        for n in nodes.values()
        if n.get("tags") and polygon.covers(Point(n["lon"], n["lat"]))
    ]
    network = graph.adjacency(Plan(start=area_id))
    eligible = {
        edge.id: edge
        for entries in network.values()
        for _, edge, _, _ in entries
        if contains_path({"kind": "boundary", "polygon": polygon}, edge.points)
    }
    summary = public_area(area_id) | {
        "road_timestamp": graph.timestamp,
        "road_count": len(roads),
        "tagged_nodes": len(node_features),
        "eligible_segments": len(eligible),
        "roads_without_surface": sum("surface" not in f["properties"] for f in roads),
        "field_verified": False,
    }
    eligible_features = [
        {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": edge.points},
            "properties": {
                "osm_way_id": edge.way,
                "name": edge.tags.get("name", "Unnamed road"),
                "basis": "Default road-bike filters, clipped to the reference polygon; junction traversal rules also apply. Not field-verified.",
            },
        }
        for edge in eligible.values()
    ]

    def collection(features):
        return {"type": "FeatureCollection", "features": features}

    zones = [f for f in graph.zone_features if shape(f["geometry"]).intersects(polygon)]
    ids = {w["id"] for w in raw_ways}
    relations = [
        r
        for r in payload["elements"]
        if r["type"] == "relation"
        and any(m.get("type") == "way" and m.get("ref") in ids for m in r.get("members", []))
    ]
    return summary, {
        "boundary.geojson": info["boundary"],
        "boundary-source.geojson": collection(info["source_features"]),
        "roads.geojson": collection(roads),
        "mapped-features.geojson": collection(node_features),
        "eligible-road-segments.geojson": collection(eligible_features),
        "excluded-estates.geojson": collection(zones),
        "osm-source.json": {
            "osm3s": payload.get("osm3s"),
            "elements": [*raw_ways, *[nodes[n] for n in used_nodes if n in nodes], *relations],
        },
    }


def download_pack(area_id):
    summary, files = area_data(area_id)
    output = io.BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(summary, indent=2))
        for name, value in files.items():
            archive.writestr(name, json.dumps(value))
        worksheet = io.StringIO()
        writer = csv.writer(worksheet)
        writer.writerow(
            [
                "osm_way_id",
                "road",
                "checked_at",
                "surface",
                "gate_or_access",
                "traffic_observation",
                "notes",
            ]
        )
        for feature in files["roads.geojson"]["features"]:
            tags = feature["properties"]
            writer.writerow(
                [tags["osm_way_id"], tags.get("name", "Unnamed road"), "", "", "", "", ""]
            )
        archive.writestr("field-checks.csv", worksheet.getvalue())
        archive.writestr(
            "README.txt",
            "Rooihuiskraal field data\n\nRoads: © OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright\nBoundary: City of Tshwane Land Boundaries; municipal source link and download date in manifest. Registered Rooihuiskraal townships only; Rooihuiskraal Noord excluded. Download time is not a survey date.\n\nRoad GeoJSON is clipped to the boundary. Raw OSM includes full touching ways and their nodes for context, plus related restrictions; relation members may extend beyond the extract. All road tags are retained, including restricted roads. Only eligible-road-segments.geojson applies default road-bike filters. The polygon bounds this reference download, not route generation. Major-road junctions stop local traversal even when an eligible side-road segment reaches that junction. Eligibility is inferred from the map, not verified access or safety. Road directions and turn restrictions still apply.\n\nUse field-checks.csv for your own observations. These files do not contain live traffic, crime statistics, terrain heights or a complete map survey. They are GIS/source data, not an OsmAnd offline basemap. Download that basemap in OsmAnd and export a route separately from Veld. No satellite or street tile cache is included.\n",
        )
    return output.getvalue()
