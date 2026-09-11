"""Route diversity, honest distance limits and local data lifecycle."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event
import pytest
from fastapi.testclient import TestClient
from app import main, osm
from app.loop_search import fingerprint, search_paths, path_end, path_start, repeated_share
from app.osm import Graph
from app.routing import Plan, km
from test_pilot import network


@pytest.fixture
def graph():
    return Graph(network())


@pytest.fixture
def client(tmp_path, monkeypatch, graph):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "private.db"))
    monkeypatch.setenv("ADMIN_KEY", "never-export-this-secret")
    monkeypatch.setattr(osm, "get_graph", lambda: graph)
    return TestClient(main.app)


def test_fingerprint_does_not_call_reverse_or_rotated_start_a_different_ride():
    coords = [(28.18, -25.88), (28.19, -25.88), (28.19, -25.89), (28.18, -25.88)]
    assert fingerprint(coords) == fingerprint(coords[::-1])
    assert fingerprint(coords) == fingerprint(coords[1:] + coords[1:2])
    assert fingerprint(coords) != fingerprint(coords + coords[1:])


def test_refresh_finds_different_roads_and_preserves_requested_fit(graph):
    plan = Plan(start_coordinates=graph.nodes[25], best_fit=True, distance=90)
    original = graph.routes(plan)["routes"]
    prior = [r["fingerprint"] for r in original]
    refreshed = graph.routes(plan.model_copy(update={"variation": 1, "exclude_routes": prior}))[
        "routes"
    ]
    assert refreshed and len(original) >= 2
    for route in refreshed:
        assert route["fingerprint"] not in prior
        length = sum(km(a, b) for a, b in zip(route["coordinates"], route["coordinates"][1:]))
        assert 90 <= length * route["laps"] <= 90 * 1.03
        assert route["coordinates"][0] == route["coordinates"][-1]
    # The same request is reproducible; random variation is explicit.
    assert [r["fingerprint"] for r in graph.routes(plan)["routes"]] == prior


def test_no_single_long_loop_is_reported_as_honest_empty_result(graph):
    result = graph.routes(
        Plan(
            start_coordinates=graph.nodes[25],
            coverage="centurion",
            best_fit=True,
            distance=180,
            max_laps=1,
        )
    )
    assert result["routes"] == []
    assert 2 < result["limits"]["longest_loop_km"] < 180
    assert result["limits"]["minimum_laps"] > 1


def test_manual_lap_count_is_independent_of_old_automatic_cap(graph):
    p = Plan(
        start_coordinates=graph.nodes[25],
        distance=90,
        laps=21,
        best_fit=False,
        max_laps=1,
        radius_km=5,
    )
    routes = graph.routes(p)["routes"]
    assert routes and all(r["laps"] == 21 for r in routes)
    assert all(r["selection"]["strategy"] == "fixed_laps" for r in routes)
    # This fixture has no 4.5 km loop within the new 3% tolerance.
    assert graph.routes(p.model_copy(update={"laps": 20}))["routes"] == []


def test_extended_loops_validate_every_turn_including_lap_join(graph):
    p = Plan(start_coordinates=graph.nodes[25], best_fit=True, distance=90)
    adjacency = graph.adjacency(p)
    paths, _ = search_paths(graph, adjacency, 25, p)
    assert paths
    incoming, outgoing = paths[0][-1][0].way, paths[0][0][0].way
    graph.rules[(25, incoming)] = [("no_right_turn", {outgoing})]
    paths, _ = search_paths(graph, adjacency, 25, p)
    assert paths
    for path in paths:
        assert repeated_share(path) <= 0.18
        for part, nxt in zip(path, path[1:] + path[:1]):
            assert path_end(part) == path_start(nxt)
            assert graph.turn_allowed(path_end(part), part[0].way, nxt[0].way)
            assert any(
                edge.id == part[0].id and reverse == part[1]
                for _, edge, reverse, _ in adjacency[path_start(part)]
            )


@pytest.mark.parametrize(
    "coverage,local", [("local", True), ("nearby", False), ("centurion", False)]
)
def test_coverage_keeps_legacy_local_flag_consistent(coverage, local):
    assert Plan(coverage=coverage, stay_local=not local).stay_local is local


LOCAL = {"X-Verge-Local-Action": "1"}


def test_private_data_export_and_delete_preserve_public_road_cache(client, graph):
    response = client.post(
        "/api/routes", json={"start_coordinates": graph.nodes[25], "best_fit": True}
    )
    assert response.status_code == 200 and response.json()["routes"]
    route_id = response.json()["routes"][0]["id"]
    count = len(response.json()["routes"])
    with main.db() as conn:
        conn.execute(
            "INSERT INTO reports VALUES(1,'osm-way-1','potholes','My observation','pending','2026-09-10','2026-10-10')"
        )
        conn.execute("INSERT INTO audit VALUES(1,1,'pending','Recorded locally','2026-09-10')")
    summary = client.get("/api/privacy/data", headers=LOCAL)
    assert summary.json() == {"saved_routes": count, "reports": 1, "audit": 1, "access_blocks": 0}
    exported = client.get("/api/privacy/export", headers=LOCAL)
    assert exported.headers["cache-control"] == "no-store"
    assert "never-export-this-secret" not in exported.text
    assert exported.json()["data"]["saved_routes"][0]["request"]["start_coordinates"] == list(
        graph.nodes[25]
    )
    assert client.delete("/api/privacy/data", headers=LOCAL).status_code == 200
    assert client.get("/api/privacy/data", headers=LOCAL).json() == {
        "saved_routes": 0,
        "reports": 0,
        "audit": 0,
        "access_blocks": 0,
    }
    assert client.get(f"/api/routes/{route_id}/gpx").status_code == 404
    assert osm.get_graph() is graph and graph.nodes


@pytest.mark.parametrize(
    "path,method",
    [("/api/privacy/export", "get"), ("/api/privacy/data", "get"), ("/api/privacy/data", "delete")],
)
def test_data_controls_reject_untrusted_websites_and_require_explicit_header(client, path, method):
    send = getattr(client, method)
    assert send(path).status_code == 403
    assert send(path, headers={**LOCAL, "Origin": "https://untrusted.example"}).status_code == 403
    assert send(path, headers={**LOCAL, "Origin": "http://testserver"}).status_code == 200


def test_private_api_rejects_cross_site_changes_and_unknown_hosts(client):
    assert (
        client.post("/api/routes", json={}, headers={"Sec-Fetch-Site": "cross-site"}).status_code
        == 403
    )
    assert (
        client.post("/api/routes", content="{}", headers={"Content-Type": "text/plain"}).status_code
        == 415
    )
    assert client.get("/api/health", headers={"Host": "untrusted.example"}).status_code == 400
    response = client.get("/api/health")
    assert response.headers["x-content-type-options"] == "nosniff"


def test_deleting_data_prevents_an_earlier_search_recreating_saved_routes(
    client, graph, monkeypatch
):
    started, release = Event(), Event()

    def delayed(*args, **kwargs):
        started.set()
        assert release.wait(5)
        return {"routes": []}

    monkeypatch.setattr(graph, "routes", delayed)
    with ThreadPoolExecutor(max_workers=1) as executor:
        pending = executor.submit(
            client.post, "/api/routes", json={"start_coordinates": graph.nodes[25]}
        )
        assert started.wait(5)
        try:
            assert client.delete("/api/privacy/data", headers=LOCAL).status_code == 200
        finally:
            release.set()
        assert pending.result().status_code == 409
    assert client.get("/api/privacy/data", headers=LOCAL).json()["saved_routes"] == 0


def test_point_refresh_never_returns_excluded_geometry_with_new_ids(graph):
    plan = Plan(
        mode="point",
        start_coordinates=graph.nodes[25],
        destination_coordinates=graph.nodes[28],
        distance=5,
    )
    routes = graph.routes(plan)["routes"]
    assert routes
    excluded = [r["fingerprint"] for r in routes]
    refreshed = graph.routes(plan.model_copy(update={"variation": 1, "exclude_routes": excluded}))[
        "routes"
    ]
    assert all(r["fingerprint"] not in excluded for r in refreshed)
