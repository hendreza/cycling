"""Download the named municipal boundary: run from the repository root."""

import json
import ssl
import sys
from datetime import datetime, timezone
from pathlib import Path
import httpx
from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.areas import area_path  # noqa: E402
from app.routing import BOUNDS, PLACES  # noqa: E402

SOURCE = "https://e-gis003.tshwane.gov.za/server/rest/services/Other_WS/Land_Boundaries/MapServer/1"


def boundary_record(payload):
    features = [
        f
        for f in payload["features"]
        if f["properties"].get("name") == "ROOIHUISKRAAL"
        and f["properties"].get("status_lu_text") == "Registered"
    ]
    if not features:
        raise ValueError("No registered Rooihuiskraal township polygons returned.")
    polygons = [shape(f["geometry"]) for f in features]
    if any(
        p.is_empty or not p.is_valid or p.geom_type not in {"Polygon", "MultiPolygon"}
        for p in polygons
    ):
        raise ValueError("Municipal service returned invalid polygons.")
    polygon = unary_union(polygons)
    anchor = PLACES["rooihuiskraal"]["coordinates"]
    w, s, e, n = polygon.bounds
    if not (
        BOUNDS[0] <= w < e <= BOUNDS[2]
        and BOUNDS[1] <= s < n <= BOUNDS[3]
        and polygon.covers(Point(anchor))
    ):
        raise ValueError("Boundary does not match Centurion coverage or the verified area anchor.")
    return {
        "id": "rooihuiskraal",
        "name": "Rooihuiskraal",
        "source": "City of Tshwane Land Boundaries",
        "source_url": SOURCE,
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "source_date": None,
        "selection": "name = ROOIHUISKRAAL, status = Registered; Rooihuiskraal Noord excluded",
        "attribution": "City of Tshwane",
        "anchor": anchor,
        "anchor_road": "Hofsanger Road",
        "anchor_way": 4940489,
        "boundary": {
            "type": "Feature",
            "properties": {"name": "Rooihuiskraal", "source": "City of Tshwane"},
            "geometry": mapping(polygon),
        },
        "source_features": features,
        "tls_verified": True,
    }


def download():
    context = ssl.create_default_context()
    # The service omits this public intermediate. The bundled intermediate was
    # verified against system trust roots; hostname and full chain checks remain on.
    context.load_verify_locations(Path(__file__).parent / "certs/geotrust-tls-rsa-ca-g1.pem")
    with httpx.Client(
        verify=context, timeout=60, headers={"User-Agent": "VeldCenturionPersonalPilot/0.2"}
    ) as client:
        response = client.post(
            SOURCE + "/query",
            data={
                "where": "name LIKE 'ROOIHUISKRAAL%'",
                "outFields": "OBJECTID,name,extension,geocode,class_lu_text,status_lu_text",
                "returnGeometry": "true",
                "outSR": "4326",
                "f": "geojson",
            },
        )
        response.raise_for_status()
        record = boundary_record(response.json())
    path = area_path("rooihuiskraal")
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".download")
    temp.write_text(json.dumps(record))
    temp.replace(path)
    print(f"Saved {len(record['source_features'])} registered township polygons to {path}")


if __name__ == "__main__":
    download()
