"""Regressions from the first ride: physical turnarounds and owner access blocks."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event
import pytest
from fastapi.testclient import TestClient
from app import main, osm
from app.access_blocks import AccessMask
from app.navigation import navigation, physical_uturn
from app.osm import Edge, Graph
from app.routing import Plan, km
from test_pilot import network


@pytest.fixture
def graph():
    return Graph(network())


@pytest.fixture
def client(tmp_path, monkeypatch, graph):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "field.db"))
    monkeypatch.setattr(osm, "get_graph", lambda: graph)
    return TestClient(main.app)


def arc(net, a, b):
    return next((e, reverse) for node, e, reverse, _ in net[a] if node == b)


def test_turnaround_follows_three_sides_of_block_instead_of_reversing(graph):
    net = graph.adjacency(Plan(start_coordinates=graph.nodes[25], radius_km=5))
    incoming = arc(net, 24, 25)
    path, _ = graph.shortest(25, 24, net, initial_part=incoming)
    assert len(path) >= 3
    assert all(graph.follows(a, b) for a, b in zip([incoming, *path], path))
    assert path[0] != (incoming[0], not incoming[1])


def test_dead_end_does_not_become_a_forced_uturn(graph):
    net = graph.adjacency(Plan(start_coordinates=graph.nodes[25]))
    incoming = arc(net, 24, 25)
    reverse = next(a for a in net[25] if a[0] == 24)
    net[25] = [reverse]
    assert graph.shortest(25, 24, net, initial_part=incoming) is None


def test_reversals_are_detected_across_different_way_ids():
    a, b, c = (28.18, -25.88), (28.181, -25.88), (28.1801, -25.88001)
    incoming = Edge("a", 1, 1, 2, (a, b), km(a, b), {})
    outgoing = Edge("b", 2, 2, 3, (b, c), km(b, c), {})
    assert physical_uturn((incoming, False), (outgoing, False))


def test_roundabout_turnaround_uses_the_mapped_circle_in_its_allowed_direction():
    points = [
        (28.185, -25.881),
        (28.185, -25.88),
        (28.1853, -25.8797),
        (28.185, -25.8794),
        (28.1847, -25.8797),
    ]
    payload = {
        "elements": [
            {"type": "node", "id": i, "lon": p[0], "lat": p[1]} for i, p in enumerate(points)
        ]
    }
    for i, (a, b) in enumerate([(0, 1), (1, 2), (2, 3), (3, 4), (4, 1)]):
        tags = {"highway": "residential", "surface": "asphalt"}
        if i:
            tags["junction"] = "roundabout"
        payload["elements"].append({"type": "way", "id": 100 + i, "nodes": [a, b], "tags": tags})
    graph = Graph(payload)
    plan = Plan(start_coordinates=points[0], coverage="centurion")
    net = graph.adjacency(plan)
    incoming = arc(net, 0, 1)
    path, _ = graph.shortest(1, 0, net, initial_part=incoming)
    assert [edge.way for edge, _ in path] == [101, 102, 103, 104, 100]
    assert all(graph.follows(a, b) for a, b in zip([incoming, *path], path))
    nav = navigation([incoming, *path], plan.model_copy(update={"mode": "point"}))
    assert nav["physical_uturns_per_lap"] == 0
    assert nav["roundabouts_need_review"]
    assert all(c["turn"] != "TU" for c in nav["cues"])


def test_loop_options_have_no_reversal_at_leg_or_lap_joins(graph):
    routes = graph.routes(Plan(start_coordinates=graph.nodes[25], best_fit=True, distance=90))[
        "routes"
    ]
    assert routes
    for route in routes:
        assert route["navigation"]["physical_uturns_per_lap"] == 0
        assert all(c["turn"] != "TU" for c in route["navigation"]["cues"])


def save_middle_section(client, graph):
    plan = {
        "mode": "point",
        "start_coordinates": graph.nodes[25],
        "destination_coordinates": graph.nodes[28],
        "coverage": "centurion",
    }
    route = client.post("/api/routes", json=plan).json()["routes"][0]
    a, b = graph.nodes[26], graph.nodes[27]
    point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    preview = client.post("/api/access-blocks/resolve", json={"coordinates": point})
    assert preview.status_code == 200
    assert preview.json()["snap_distance_m"] < 0.1
    saved = client.post(
        "/api/access-blocks",
        json={
            "coordinates": point,
            "edge_id": preview.json()["edge_id"],
            "note": "Resident gate; could not enter",
        },
    )
    assert saved.status_code == 201
    return plan, route, saved.json()


def test_access_block_persists_hard_excludes_and_invalidates_old_exports(client, graph):
    plan, route, block = save_middle_section(client, graph)
    assert client.get("/api/access-blocks").json() == [block]
    assert client.get(f"/api/routes/{route['id']}/access").json() == {
        "blocked": True,
        "current_policy": True,
    }
    for format in ("gpx", "osmand"):
        assert client.get(f"/api/routes/{route['id']}/gpx?format={format}").status_code == 409
    result = client.post("/api/routes", json=plan)
    assert result.status_code == 200 and result.json()["routes"]
    for alternative in result.json()["routes"]:
        assert block["way_id"] not in {r["way_id"] for r in alternative["roads"]}
        assert client.get(f"/api/routes/{alternative['id']}/gpx").status_code == 200
    # A second independent client sees the same saved owner observation.
    assert TestClient(main.app).get("/api/access-blocks").json() == [block]
    assert client.delete(f"/api/access-blocks/{block['id']}").status_code == 200
    assert client.get(f"/api/routes/{route['id']}/gpx").status_code == 200


def test_scope_blocks_the_section_but_keeps_roads_touching_its_junction(graph):
    a, b, c = graph.nodes[25], graph.nodes[26], graph.nodes[27]
    mask = AccessMask([{"geometry": [a, b]}])
    assert mask.matches([a, b])
    assert mask.matches([((a[0] + b[0]) / 2, a[1]), b])
    assert not mask.matches([b, c])
    assert not mask.matches([graph.nodes[19], b])
    assert not mask.matches([(a[0], a[1] + 0.0001), (b[0], b[1] + 0.0001)])


def test_access_blocks_are_exported_deleted_and_starts_cannot_snap_onto_them(client, graph):
    plan, _, block = save_middle_section(client, graph)
    headers = {"X-Verge-Local-Action": "1"}
    data = client.get("/api/privacy/export", headers=headers).json()
    assert data["data"]["access_blocks"][0]["payload"] == block
    response = client.post(
        "/api/locations/resolve", json={"plan": {**plan, "start_coordinates": block["coordinates"]}}
    )
    assert response.status_code == 422 and "20 m" in response.json()["detail"]
    assert client.delete("/api/privacy/data", headers=headers).status_code == 200
    assert client.get("/api/access-blocks").json() == []


def test_missing_road_and_changed_preview_cannot_create_an_arbitrary_block(client):
    for point in ([0, 0], [28.07, -25.98]):
        assert (
            client.post("/api/access-blocks/resolve", json={"coordinates": point}).status_code
            == 422
        )
    assert (
        client.post(
            "/api/access-blocks", json={"coordinates": [28.18, -25.88], "edge_id": "made-up"}
        ).status_code
        == 422
    )
    assert client.get("/api/access-blocks").json() == []


def test_new_access_block_rejects_a_search_started_before_it(client, graph, monkeypatch):
    entered, release = Event(), Event()
    original = graph.routes

    def delayed(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return original(*args, **kwargs)

    monkeypatch.setattr(graph, "routes", delayed)
    with ThreadPoolExecutor(max_workers=1) as executor:
        pending = executor.submit(
            client.post, "/api/routes", json={"start_coordinates": graph.nodes[25]}
        )
        assert entered.wait(5)
        try:
            a, b = graph.nodes[26], graph.nodes[27]
            preview = client.post(
                "/api/access-blocks/resolve", json={"coordinates": [(a[0] + b[0]) / 2, a[1]]}
            ).json()
            assert client.post("/api/access-blocks", json=preview).status_code == 201
        finally:
            release.set()
        assert pending.result().status_code == 409


def test_new_block_cancels_an_export_already_being_prepared(client, graph, monkeypatch):
    plan = {
        "mode": "point",
        "start_coordinates": graph.nodes[25],
        "destination_coordinates": graph.nodes[28],
    }
    route = client.post("/api/routes", json=plan).json()["routes"][0]
    entered, release = Event(), Event()
    original = main.gpx

    def delayed(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return original(*args, **kwargs)

    monkeypatch.setattr(main, "gpx", delayed)
    with ThreadPoolExecutor(max_workers=1) as executor:
        pending = executor.submit(client.get, f"/api/routes/{route['id']}/gpx")
        assert entered.wait(5)
        try:
            a, b = graph.nodes[26], graph.nodes[27]
            preview = client.post(
                "/api/access-blocks/resolve", json={"coordinates": [(a[0] + b[0]) / 2, a[1]]}
            ).json()
            assert client.post("/api/access-blocks", json=preview).status_code == 201
        finally:
            release.set()
        assert pending.result().status_code == 409


def test_delete_prevents_inflight_access_save_recreating_private_data(client, graph, monkeypatch):
    a, b = graph.nodes[26], graph.nodes[27]
    request = {"coordinates": [(a[0] + b[0]) / 2, a[1]]}
    preview = client.post("/api/access-blocks/resolve", json=request).json()
    entered, release = Event(), Event()
    original = main.preview_access_block

    def delayed(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return original(*args, **kwargs)

    monkeypatch.setattr(main, "preview_access_block", delayed)
    with ThreadPoolExecutor(max_workers=1) as executor:
        pending = executor.submit(client.post, "/api/access-blocks", json=preview)
        assert entered.wait(5)
        try:
            assert (
                client.delete(
                    "/api/privacy/data", headers={"X-Verge-Local-Action": "1"}
                ).status_code
                == 200
            )
        finally:
            release.set()
        assert pending.result().status_code == 409
    assert client.get("/api/access-blocks").json() == []


def test_block_does_not_exclude_a_different_road_crossing_at_its_middle():
    a, b = (28.18, -25.88), (28.181, -25.88)
    mask = AccessMask([{"geometry": [a, b]}])
    # Unconnected crossings, including a shallow diagonal and a tiny compressed edge.
    assert not mask.matches([(28.1805, -25.881), (28.1805, -25.879)])
    assert not mask.matches([(28.18, -25.8805), (28.181, -25.8795)])
    assert not mask.matches([(28.1805, -25.880001), (28.1805, -25.879999)])
    assert mask.matches([(28.1801, -25.88), (28.1808, -25.88)])
