"""Optional source names to explain where a route goes; never routing limits."""

import json
import os
from functools import lru_cache
from pathlib import Path
from shapely.geometry import LineString, Point, shape
from .routing import km


@lru_cache(maxsize=2)
def _read(path, modified):
    data = json.loads(Path(path).read_text())
    return data, [(f["properties"]["name"], shape(f["geometry"])) for f in data["features"]]


def route_areas(coords):
    path = Path(
        os.getenv(
            "VELD_NEIGHBOURHOODS_PATH",
            str(Path(__file__).resolve().parents[2] / "data/areas/centurion-neighbourhoods.json"),
        )
    )
    if not path.exists():
        return []
    try:
        data, areas = _read(str(path), path.stat().st_mtime_ns)
    except (ValueError, KeyError):
        return []
    line = LineString(coords)
    result = []
    for name, polygon in areas:
        if not polygon.intersects(line):
            continue
        cut = polygon.intersection(line)
        parts = list(cut.geoms) if hasattr(cut, "geoms") else [cut]
        length = sum(
            km(a, b)
            for part in parts
            if part.geom_type == "LineString"
            for a, b in zip(list(part.coords), list(part.coords)[1:])
        )
        if length < 0.02:
            continue
        first = next((i for i, c in enumerate(coords) if polygon.covers(Point(c))), len(coords))
        result.append(
            (first, {"name": name, "distance_km": round(length, 2), "source": data["source"]})
        )
    return [entry for _, entry in sorted(result, key=lambda item: item[0])]
