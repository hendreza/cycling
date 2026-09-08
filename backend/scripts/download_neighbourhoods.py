"""Optional municipal names for route labels. These polygons never restrict routes."""

import json
import os
import ssl
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
import httpx
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.routing import BOUNDS  # noqa: E402

SOURCE = "https://e-gis003.tshwane.gov.za/server/rest/services/Other_WS/Land_Boundaries/MapServer/1"


def download():
    context = ssl.create_default_context()
    context.load_verify_locations(Path(__file__).parent / "certs/geotrust-tls-rsa-ca-g1.pem")
    w, s, e, n = BOUNDS
    payload = {
        "where": "1=1",
        "geometry": json.dumps(
            {"xmin": w, "ymin": s, "xmax": e, "ymax": n, "spatialReference": {"wkid": 4326}}
        ),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "OBJECTID,name,extension,geocode,class_lu_text,status_lu_text",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "geojson",
        "resultRecordCount": "2000",
    }
    with httpx.Client(
        verify=context, timeout=90, headers={"User-Agent": "VeldCenturionPersonalPilot/0.2"}
    ) as client:
        response = client.post(SOURCE + "/query", data=payload)
        response.raise_for_status()
        result = response.json()
    if result.get("exceededTransferLimit") or result.get("properties", {}).get(
        "exceededTransferLimit"
    ):
        raise ValueError("Municipal labels were truncated; existing cache retained.")
    groups = defaultdict(list)
    for feature in result["features"]:
        properties = feature["properties"]
        if (
            properties.get("status_lu_text") != "Registered"
            or properties.get("class_lu_text") != "Township"
        ):
            continue
        polygon = shape(feature["geometry"])
        if (
            polygon.is_valid
            and polygon.geom_type in {"Polygon", "MultiPolygon"}
            and polygon.intersects(box(*BOUNDS))
        ):
            groups[properties["name"].title()].append(polygon.intersection(box(*BOUNDS)))
    if not groups:
        raise ValueError("No registered township labels returned.")
    value = {
        "source": "City of Tshwane Land Boundaries",
        "source_url": SOURCE,
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "features": [
            {
                "type": "Feature",
                "properties": {"name": name},
                "geometry": mapping(unary_union(polygons)),
            }
            for name, polygons in sorted(groups.items())
        ],
    }
    path = Path(
        os.getenv(
            "VELD_NEIGHBOURHOODS_PATH",
            str(Path(__file__).resolve().parents[2] / "data/areas/centurion-neighbourhoods.json"),
        )
    )
    path.parent.mkdir(exist_ok=True, parents=True)
    temp = path.with_suffix(".download")
    temp.write_text(json.dumps(value))
    temp.replace(path)
    print(f"Downloaded {len(groups)} township labels")


if __name__ == "__main__":
    download()
