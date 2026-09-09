"""Road-based riding limits; administrative polygons retained for reference only."""

import json
import os
from functools import lru_cache
from pathlib import Path
from shapely.geometry import shape, LineString
from .routing import km


def area_path(area_id):
    if area_id != "rooihuiskraal":
        return None
    return Path(
        os.getenv(
            "VELD_AREA_PATH",
            str(Path(__file__).resolve().parents[2] / "data/areas/rooihuiskraal.json"),
        )
    )


@lru_cache(maxsize=8)
def _read(path, modified):
    value = json.loads(Path(path).read_text())
    polygon = shape(value["boundary"]["geometry"])
    if (
        polygon.is_empty
        or not polygon.is_valid
        or polygon.geom_type not in {"Polygon", "MultiPolygon"}
    ):
        raise ValueError("Area boundary is invalid. Re-download the area data.")
    return value, polygon


def get_area(area_id):
    path = area_path(area_id)
    if path is None or not path.exists():
        return None
    return _read(str(path), path.stat().st_mtime_ns)


def locality(plan):
    if plan.mode != "loop":
        return None
    if plan.coverage == "centurion":
        return {"kind": "coverage", "name": "Across Centurion", "point": plan.point("start")}
    if not plan.stay_local:
        return {
            "kind": "radius",
            "name": f"Within {plan.radius_km:g} km of the start",
            "point": plan.point("start"),
            "radius_km": plan.radius_km,
        }
    return {
        "kind": "road_cell",
        "name": "Connected roads between major roads",
        "point": plan.point("start"),
    }


def contains_path(area, points):
    if area is None or area["kind"] in {"road_cell", "coverage"}:
        return True
    if area["kind"] == "boundary":
        return area["polygon"].covers(LineString(points))
    return all(km(area["point"], point) <= area["radius_km"] for point in points)


def public_area(area_id):
    area = get_area(area_id)
    if not area:
        return None
    info, polygon = area
    return {
        k: info[k]
        for k in (
            "id",
            "name",
            "source",
            "source_url",
            "downloaded_at",
            "anchor",
            "anchor_road",
            "boundary",
        )
    } | {"bounds": polygon.bounds}
