import os
import json
import uuid
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from .routing import PLACES, Plan
from . import osm
from .areas import public_area
from .navigation import gpx
from .area_pack import area_data, download_pack

app = FastAPI(title="Veld · Centurion cycling pilot", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Admin-Key"],
)


@contextmanager
def db():
    path = Path(os.getenv("DATABASE_PATH", "data/pilot.db"))
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY, segment_id TEXT NOT NULL, category TEXT NOT NULL,
            detail TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS saved_routes (
            id TEXT PRIMARY KEY, payload TEXT NOT NULL, request TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit (
            id INTEGER PRIMARY KEY, report_id INTEGER NOT NULL, action TEXT NOT NULL,
            reason TEXT NOT NULL, created_at TEXT NOT NULL);
    """)
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "osm-local", "coverage": "Centurion"}


@app.get("/api/data/status")
def data_status():
    return osm.status()


@app.get("/api/data/exclusions")
def exclusion_areas():
    try:
        return {"type": "FeatureCollection", "features": osm.get_graph().zone_features}
    except FileNotFoundError:
        return {"type": "FeatureCollection", "features": []}


@app.get("/api/data/major-roads")
def major_roads():
    try:
        return osm.get_graph().barriers.features()
    except FileNotFoundError:
        return {"type": "FeatureCollection", "features": []}


@app.get("/api/areas/{area_id}")
def area_details(area_id: str):
    area = public_area(area_id)
    if not area:
        raise HTTPException(404, "Area boundary is not downloaded.")
    return area


@app.get("/api/areas/{area_id}/data")
def area_summary(area_id: str):
    try:
        return area_data(area_id)[0]
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/areas/{area_id}/download")
def area_download(area_id: str):
    try:
        content = download_pack(area_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return Response(
        content,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="rooihuiskraal-field-data.zip"'},
    )


@app.post("/api/data/refresh", status_code=202)
def refresh_data(background: BackgroundTasks):
    background.add_task(osm.download_extract)
    return {"message": "Road refresh queued. Existing routes remain available."}


@app.get("/api/places")
def places():
    return [{"id": k, **v, "area": public_area(k)} for k, v in PLACES.items()]


class LocationRequest(BaseModel):
    plan: Plan
    kind: Literal["start", "destination"] = "start"


@app.post("/api/locations/resolve")
def resolve_location(request: LocationRequest):
    try:
        graph = osm.get_graph()
        network = graph.adjacency(request.plan)
        point = request.plan.point(request.kind)
        node, gap = graph.snap(point, network)
        edges = [
            edge
            for entries in network.values()
            for to, edge, _, _ in entries
            if edge.a == node or edge.b == node
        ]
        edge = min(edges, key=lambda e: e.id)
        return {
            "requested_coordinates": point,
            "coordinates": network.nodes[node],
            "snap_distance_m": gap,
            "road_name": edge.tags.get("name", "Unnamed road"),
            "way_id": edge.way,
            "road_class": edge.tags.get("highway"),
            "surface": edge.tags.get("surface", "unknown"),
        }
    except FileNotFoundError as exc:
        raise HTTPException(503, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/routes")
def routes(request: Plan):
    try:
        with db() as conn:
            adverse = conn.execute(
                "SELECT id,segment_id,category,detail,created_at FROM reports WHERE status='approved' AND expires_at>? AND category NOT IN ('good-surface','low-traffic','good-signage','confirmed-open')",
                (datetime.now(timezone.utc).isoformat(),),
            ).fetchall()
        hazards = [
            {
                "way_id": int(row["segment_id"].removeprefix("osm-way-")),
                "category": row["category"],
                "detail": row["detail"],
                "reported_at": row["created_at"],
            }
            for row in adverse
        ]
        result = osm.get_graph().routes(request, hazards)
    except FileNotFoundError as exc:
        raise HTTPException(503, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    with db() as conn:
        for route in result["routes"]:
            route["id"] = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO saved_routes(id,payload,request,created_at) VALUES(?,?,?,?)",
                (
                    route["id"],
                    json.dumps(route),
                    request.model_dump_json(),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
    return result


@app.get("/api/routes/{route_id}/gpx")
def export(
    route_id: str,
    format: Literal["gpx", "osmand"] = "gpx",
    laps: Literal["all", "single"] = "all",
    speed_kmh: float | None = Query(default=None, ge=8, le=40),
):
    with db() as conn:
        row = conn.execute("SELECT payload FROM saved_routes WHERE id=?", (route_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Saved route not found. Plan a new route.")
    route = json.loads(row["payload"])
    if route.get("policy_version") != osm.POLICY_VERSION:
        raise HTTPException(
            409, "Routing access rules changed. Find routes again before exporting."
        )
    try:
        document = gpx(
            route, osmand=format == "osmand", one_lap=laps == "single", speed_kmh=speed_kmh
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return Response(
        document,
        media_type="application/gpx+xml",
        headers={
            "Content-Disposition": f'attachment; filename="veld-centurion-{route_id[:8]}.gpx"'
        },
    )


CATEGORIES = Literal[
    "dangerous-traffic",
    "potholes",
    "closure",
    "access-change",
    "dogs",
    "harassment",
    "security-concern",
    "poor-maintenance",
    "good-surface",
    "low-traffic",
    "good-signage",
    "confirmed-open",
]


class Report(BaseModel):
    segment_id: str
    category: CATEGORIES
    detail: str = Field(min_length=10, max_length=1000)


@app.post("/api/reports", status_code=201)
def submit(report: Report):
    try:
        way = int(report.segment_id.removeprefix("osm-way-"))
        known = report.segment_id.startswith("osm-way-") and way in osm.get_graph().way_tags
    except (ValueError, FileNotFoundError):
        known = False
    if not known:
        raise HTTPException(422, "Unknown OSM road")
    now = datetime.now(timezone.utc)
    with db() as conn:
        duplicate = conn.execute(
            "SELECT id FROM reports WHERE segment_id=? AND category=? AND detail=? AND created_at>?",
            (
                report.segment_id,
                report.category,
                report.detail,
                (now - timedelta(days=1)).isoformat(),
            ),
        ).fetchone()
        if duplicate:
            raise HTTPException(409, "This report has already been submitted today.")
        cursor = conn.execute(
            "INSERT INTO reports(segment_id,category,detail,created_at,expires_at) VALUES(?,?,?,?,?)",
            (
                report.segment_id,
                report.category,
                report.detail,
                now.isoformat(),
                (now + timedelta(days=30)).isoformat(),
            ),
        )
        return {
            "id": cursor.lastrowid,
            "status": "pending",
            "message": "Report saved for moderation. Use Avoid this road to exclude it from your own routes immediately.",
        }


@app.get("/api/reports")
def reports():
    with db() as conn:
        return [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM reports WHERE status='approved' AND expires_at>? ORDER BY id DESC LIMIT 100",
                (datetime.now(timezone.utc).isoformat(),),
            )
        ]


def admin(x_admin_key: str = Header(default="")):
    key = os.getenv("ADMIN_KEY", "")
    if not key or not secrets.compare_digest(key, x_admin_key):
        raise HTTPException(403, "Administrator key required")


@app.get("/api/admin/reports", dependencies=[Depends(admin)])
def queue():
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM reports ORDER BY id DESC LIMIT 200")]


class Decision(BaseModel):
    status: Literal["approved", "rejected"]
    reason: str = Field(min_length=5, max_length=500)


@app.post("/api/admin/reports/{report_id}", dependencies=[Depends(admin)])
def moderate(report_id: int, decision: Decision):
    with db() as conn:
        if not conn.execute("SELECT id FROM reports WHERE id=?", (report_id,)).fetchone():
            raise HTTPException(404, "Report not found")
        conn.execute("UPDATE reports SET status=? WHERE id=?", (decision.status, report_id))
        conn.execute(
            "INSERT INTO audit(report_id,action,reason,created_at) VALUES(?,?,?,?)",
            (report_id, decision.status, decision.reason, datetime.now(timezone.utc).isoformat()),
        )
    return {"status": decision.status}


@app.get("/api/admin/audit", dependencies=[Depends(admin)])
def audit():
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 200")]
