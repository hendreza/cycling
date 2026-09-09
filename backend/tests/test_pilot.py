import json
from xml.etree import ElementTree
import pytest
from fastapi.testclient import TestClient
from app import osm
from app.main import app
from app.osm import Graph, eligible, node_allowed
from app.routing import PLACES, Plan, inside, km


def network():
    elements = []
    for y in range(7):
        for x in range(7):
            elements.append(
                {
                    "type": "node",
                    "id": y * 7 + x + 1,
                    "lon": 28.1742 + x * 0.005,
                    "lat": -25.8932 + y * 0.005,
                }
            )
    for y in range(7):
        for x in range(7):
            a = y * 7 + x + 1
            for b in (a + 1, a + 7):
                if b > 49 or (b == a + 1 and x == 6):
                    continue
                elements.append(
                    {
                        "type": "way",
                        "id": 1000 + a * 100 + b,
                        "nodes": [a, b],
                        "tags": {
                            "name": f"Fixture road {a}-{b}",
                            "highway": "residential",
                            "surface": "asphalt",
                        },
                    }
                )
    return {"osm3s": {"timestamp_osm_base": "2026-09-07T00:00:00Z"}, "elements": elements}


@pytest.fixture(autouse=True)
def fixture_area_anchors(monkeypatch):
    # Unit network uses a deterministic public-road vertex, independent of live area anchors.
    monkeypatch.setitem(
        PLACES, "highveld", {"name": "Fixture Highveld", "coordinates": (28.1892, -25.8782)}
    )


@pytest.fixture
def graph():
    return Graph(network())


@pytest.fixture
def client(tmp_path, monkeypatch, graph):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("ADMIN_KEY", "test-admin-secret")
    monkeypatch.setattr(osm, "get_graph", lambda: graph)
    return TestClient(app)


@pytest.mark.parametrize(
    "access", ["private", "unknown", "no", "customers", "destination", "permit", "residents"]
)
def test_hard_access_not_overridden_by_profile_or_consent(access):
    assert not eligible(
        {"highway": "residential", "access": access, "bicycle": "designated"},
        Plan(radius_km=5, paid=True, membership=True, registration=True),
    )


@pytest.mark.parametrize(
    "highway",
    ["motorway", "motorway_link", "trunk", "trunk_link", "construction", "proposed", "steps"],
)
def test_prohibited_road_classes(highway):
    assert not eligible({"highway": highway, "bicycle": "yes"}, Plan(radius_km=5, profile="mtb"))


def test_road_surface_unknown_is_not_fabricated():
    assert eligible({"highway": "residential"}, Plan(radius_km=5))
    assert not eligible({"highway": "residential", "surface": "gravel"}, Plan(radius_km=5))
    assert eligible(
        {"highway": "residential", "surface": "gravel"}, Plan(radius_km=5, profile="gravel")
    )
    assert not eligible({"highway": "path"}, Plan(radius_km=5, profile="mtb"))
    assert not eligible(
        {"highway": "path", "bicycle": "yes", "mtb:scale": "3"},
        Plan(radius_km=5, profile="mtb", difficulty=2),
    )
    assert eligible(
        {"highway": "path", "bicycle": "yes", "mtb:scale": "2"},
        Plan(radius_km=5, profile="mtb", difficulty=2),
    )


def test_service_access_and_paid_consent():
    assert not eligible({"highway": "service"}, Plan(radius_km=5))
    assert eligible({"highway": "service", "access": "yes"}, Plan(radius_km=5))
    assert not eligible(
        {"highway": "service", "access": "yes", "service": "driveway"}, Plan(radius_km=5)
    )
    assert not eligible({"highway": "cycleway", "fee": "yes"}, Plan(radius_km=5))
    assert eligible({"highway": "cycleway", "fee": "yes"}, Plan(radius_km=5, paid=True))


@pytest.mark.parametrize(
    "tags",
    [
        {"access:conditional": "yes @ (08:00-16:00)"},
        {"bicycle": "no"},
        {"motorroad": "yes"},
        {"smoothness": "impassable"},
    ],
)
def test_unresolved_and_blocked_conditions(tags):
    assert not eligible({"highway": "residential", **tags}, Plan(radius_km=5))


def test_gate_requires_explicit_bicycle_permission():
    assert not node_allowed({"barrier": "gate"})
    assert not node_allowed({"barrier": "gate", "bicycle": "yes", "access": "private"})
    assert not node_allowed({"barrier": "gate", "bicycle": "yes", "locked": "yes"})
    assert node_allowed({"barrier": "gate", "bicycle": "yes"})
    assert node_allowed({"barrier": "bollard"})


def test_gate_splits_and_blocks_graph():
    d = network()
    d["elements"][24]["tags"] = {"barrier": "gate"}
    g = Graph(d)
    assert all(e.a != 25 and e.b != 25 for e in g.edges)


def test_oneway_and_bicycle_exception():
    d = network()
    w = next(e for e in d["elements"] if e["type"] == "way")
    w["tags"]["oneway"] = "yes"
    g = Graph(d)
    adj = g.adjacency(Plan(radius_km=5))
    a, b = w["nodes"]
    assert any(e.way == w["id"] for _, e, _, _ in adj[a])
    assert not any(e.way == w["id"] for _, e, _, _ in adj[b])
    w["tags"]["oneway:bicycle"] = "no"
    adj = Graph(d).adjacency(Plan(radius_km=5))
    assert any(e.way == w["id"] for _, e, _, _ in adj[b])


def test_turn_restriction_changes_path():
    d = network()
    ways = [e for e in d["elements"] if e["type"] == "way"]
    frm = next(w for w in ways if w["nodes"] == [1, 2])
    to = next(w for w in ways if w["nodes"] == [2, 3])
    d["elements"].append(
        {
            "type": "relation",
            "id": 99,
            "tags": {"type": "restriction", "restriction": "no_straight_on"},
            "members": [
                {"type": "way", "role": "from", "ref": frm["id"]},
                {"type": "node", "role": "via", "ref": 2},
                {"type": "way", "role": "to", "ref": to["id"]},
            ],
        }
    )
    g = Graph(d)
    path, _ = g.shortest(1, 3, g.adjacency(Plan(radius_km=5)))
    assert len(path) > 2
    assert not g.turn_allowed(2, frm["id"], to["id"])


def test_via_way_restriction_conservatively_excludes_from_way():
    d = network()
    w = next(e for e in d["elements"] if e["type"] == "way")
    d["elements"].append(
        {
            "type": "relation",
            "id": 99,
            "tags": {"type": "restriction", "restriction": "no_left_turn"},
            "members": [
                {"type": "way", "role": "from", "ref": w["id"]},
                {"type": "way", "role": "via", "ref": 900},
                {"type": "way", "role": "to", "ref": 901},
            ],
        }
    )
    g = Graph(d)
    assert w["id"] in g.blocked_ways
    assert all(
        e.way != w["id"]
        for edges in g.adjacency(Plan(radius_km=5)).values()
        for _, e, _, _ in edges
    )


def test_avoid_roads_and_full_geometry_bounds(graph):
    way = graph.edges[0].way
    adj = graph.adjacency(Plan(radius_km=5, avoid_ways=[way]))
    assert all(e.way != way for neighbours in adj.values() for _, e, _, _ in neighbours)
    assert all(inside(point) for e in graph.edges for point in e.points)


@pytest.mark.parametrize("profile", ["road", "gravel", "mtb"])
def test_real_geometry_loop_invariants(graph, profile):
    p = Plan(radius_km=5, distance=7, profile=profile)
    routes = graph.routes(p)["routes"]
    assert routes
    for r in routes:
        assert r["coordinates"][0] == r["coordinates"][-1]
        actual = sum(km(a, b) for a, b in zip(r["coordinates"], r["coordinates"][1:]))
        assert abs(actual - 7) <= 0.7
        assert abs(actual * 1000 - r["distance_m"]) <= 1
        assert all(inside(c) for c in r["coordinates"])
        assert r["elevation"] is None and r["score"] is None and r["traffic"] is None
        assert not r["demo"] and r["roads"]


def test_snap_rejects_distant_points(graph):
    with pytest.raises(ValueError, match="20 m"):
        graph.snap((28.07, -25.97), graph.adjacency(Plan(radius_km=5)))


def test_request_validation(client):
    for body in (
        {"start": "cape-town"},
        {"start_coordinates": [18, -33]},
        {"distance": 0},
        {"profile": "car"},
        {"mode": "point", "start": "irene", "destination": "irene"},
    ):
        assert client.post("/api/routes", json=body).status_code == 422


def test_saved_gpx_is_identical_even_after_graph_changes(client, monkeypatch):
    response = client.post("/api/routes", json={"radius_km": 5, "distance": 7})
    assert response.status_code == 200
    route = response.json()["routes"][0]
    monkeypatch.setattr(
        osm, "get_graph", lambda: (_ for _ in ()).throw(RuntimeError("Graph replaced"))
    )
    response = client.get(f"/api/routes/{route['id']}/gpx")
    assert response.status_code == 200
    root = ElementTree.fromstring(response.content)
    ns = {"g": "http://www.topografix.com/GPX/1/1"}
    points = root.findall(".//g:trkpt", ns)
    assert [[float(p.attrib["lon"]), float(p.attrib["lat"])] for p in points] == route[
        "coordinates"
    ]
    assert "OpenStreetMap" in response.text and "SYNTHETIC" not in response.text
    assert client.get("/api/routes/missing/gpx").status_code == 404


def test_reports_moderation_and_audit(client, graph):
    report = {
        "segment_id": f"osm-way-{graph.edges[0].way}",
        "category": "potholes",
        "detail": "Actual observation used in a unit test.",
    }
    response = client.post("/api/reports", json=report)
    assert response.status_code == 201
    assert client.post("/api/reports", json=report).status_code == 409
    assert client.get("/api/reports").json() == []
    assert client.get("/api/admin/reports").status_code == 403
    rid = response.json()["id"]
    headers = {"X-Admin-Key": "test-admin-secret"}
    assert (
        client.post(
            f"/api/admin/reports/{rid}",
            json={"status": "approved", "reason": "Reviewed observation"},
            headers=headers,
        ).status_code
        == 200
    )
    assert len(client.get("/api/reports").json()) == 1
    assert client.get("/api/admin/audit", headers=headers).json()[0]["report_id"] == rid
    from app.main import db

    with db() as conn:
        conn.execute("UPDATE reports SET expires_at='2000-01-01' WHERE id=?", (rid,))
    assert client.get("/api/reports").json() == []


def test_missing_data_is_explicit(client, monkeypatch):
    monkeypatch.setattr(
        osm, "get_graph", lambda: (_ for _ in ()).throw(FileNotFoundError("Download road data"))
    )
    r = client.post("/api/routes", json={})
    assert r.status_code == 503
    assert "Download" in r.json()["detail"]


def test_partial_download_preserves_existing_file(tmp_path, monkeypatch):
    path = tmp_path / "roads.json"
    path.write_text(json.dumps(network()))
    original = path.read_bytes()
    monkeypatch.setenv("OSM_DATA_PATH", str(path))

    class Client:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def post(self, *args, **kwargs):
            class Response:
                def raise_for_status(self):
                    pass

                def json(self):
                    return {"remark": "runtime error: timeout", "elements": []}

            return Response()

    monkeypatch.setattr(osm.httpx, "Client", Client)
    osm.download_extract()
    assert path.read_bytes() == original and osm._state["error"]


def test_clipping_never_connects_across_outside_node():
    d = {
        "elements": [
            {"type": "node", "id": 1, "lon": 28.18, "lat": -25.88},
            {"type": "node", "id": 2, "lon": 28.3, "lat": -25.88},
            {"type": "node", "id": 3, "lon": 28.19, "lat": -25.88},
            {"type": "way", "id": 1, "nodes": [1, 2, 3], "tags": {"highway": "residential"}},
        ]
    }
    assert not Graph(d).edges


def test_unknown_explicit_permissions_fail_closed():
    assert not eligible({"highway": "residential", "access": "unverified"}, Plan(radius_km=5))
    assert not eligible({"highway": "residential", "bicycle": "discouraged"}, Plan(radius_km=5))
    assert not node_allowed({"barrier": "sally_port"})


def test_direction_specific_bicycle_prohibition():
    d = network()
    w = next(e for e in d["elements"] if e["type"] == "way")
    w["tags"]["bicycle:backward"] = "no"
    graph = Graph(d).adjacency(Plan(radius_km=5))
    assert any(e.way == w["id"] for _, e, _, _ in graph[w["nodes"][0]])
    assert not any(e.way == w["id"] for _, e, _, _ in graph[w["nodes"][1]])


def test_estate_polygon_blocks_crossing_with_both_endpoints_outside():
    d = network()
    # Narrow strip cuts a road between two nodes, so checking endpoints alone would miss it.
    d["veld_access_zones"] = [
        {
            "type": "way",
            "id": 999,
            "tags": {"landuse": "residential", "name": "Test Estate"},
            "geometry": [
                {"lon": 28.176, "lat": -25.895},
                {"lon": 28.177, "lat": -25.895},
                {"lon": 28.177, "lat": -25.891},
                {"lon": 28.176, "lat": -25.891},
                {"lon": 28.176, "lat": -25.895},
            ],
        }
    ]
    g = Graph(d)
    assert g.zone_excluded_edges > 0
    assert not any(e.a == 1 and e.b == 2 for e in g.edges)
    with pytest.raises(ValueError, match="mapped estate"):
        g.snap((28.1765, -25.8932), g.adjacency(Plan(radius_km=5)))


def test_gated_residential_polygon_without_estate_name_is_excluded():
    from app.access_zones import build_zones

    _, features = build_zones(
        [
            {
                "type": "way",
                "id": 1,
                "tags": {
                    "landuse": "residential",
                    "name": "Private complex",
                    "residential": "gated",
                },
                "geometry": [
                    {"lon": 28.18, "lat": -25.89},
                    {"lon": 28.19, "lat": -25.89},
                    {"lon": 28.19, "lat": -25.88},
                    {"lon": 28.18, "lat": -25.89},
                ],
            }
        ]
    )
    assert len(features) == 1
    assert "gated/private" in features[0]["properties"]["reason"]


def test_incomplete_estate_boundary_is_not_silently_ignored():
    from app.access_zones import build_zones

    with pytest.raises(ValueError, match="Incomplete boundary"):
        build_zones([{"type": "way", "id": 1, "tags": {"name": "Test Estate"}, "geometry": []}])


def test_old_access_policy_requires_replanning_before_export(client):
    from app.main import db

    response = client.post("/api/routes", json={"radius_km": 5, "distance": 7})
    route = response.json()["routes"][0]
    route["policy_version"] = "obsolete-access-rules"
    with db() as conn:
        conn.execute(
            "UPDATE saved_routes SET payload=? WHERE id=?", (json.dumps(route), route["id"])
        )
    result = client.get(f"/api/routes/{route['id']}/gpx")
    assert result.status_code == 409 and "Find routes again" in result.json()["detail"]


def test_unresolved_opening_hours_are_excluded():
    assert not eligible({"highway": "cycleway", "opening_hours": "08:00-17:00"}, Plan(radius_km=5))
    assert eligible({"highway": "cycleway", "opening_hours": "24/7"}, Plan(radius_km=5))


def test_laps_generate_shorter_loop_and_scale_full_ride(graph):
    single = graph.routes(Plan(radius_km=5, distance=7))["routes"]
    repeated = graph.routes(Plan(radius_km=5, distance=28, laps=4))["routes"]
    assert repeated and len(single) == len(repeated)
    for one, multi in zip(single, repeated):
        assert one["coordinates"] == multi["coordinates"]
        assert multi["coordinates"][0] == multi["coordinates"][-1]
        actual = sum(km(a, b) for a, b in zip(multi["coordinates"], multi["coordinates"][1:]))
        assert abs(actual - 7) <= 0.7
        assert abs(actual * 4 - 28) <= 2.8
        assert multi["laps"] == 4
        assert abs(multi["lap_distance_m"] - actual * 1000) <= 1
        assert abs(multi["distance_m"] - actual * 4000) <= 1
        assert multi["duration"] == round(actual * 4 / 20 * 60)
        assert multi["roads"] == one["roads"]
        assert multi["surface"] == one["surface"]


def test_lap_gpx_repeats_exact_saved_geometry(client, monkeypatch):
    route = client.post("/api/routes", json={"radius_km": 5, "distance": 28, "laps": 4}).json()[
        "routes"
    ][0]
    monkeypatch.setattr(
        osm, "get_graph", lambda: (_ for _ in ()).throw(RuntimeError("Graph unavailable"))
    )
    response = client.get(f"/api/routes/{route['id']}/gpx")
    assert response.status_code == 200
    root = ElementTree.fromstring(response.content)
    ns = {"g": "http://www.topografix.com/GPX/1/1"}
    segments = root.findall(".//g:trkseg", ns)
    assert len(segments) == 4
    for segment in segments:
        points = segment.findall("g:trkpt", ns)
        assert [[float(p.attrib["lon"]), float(p.attrib["lat"])] for p in points] == route[
            "coordinates"
        ]
    assert "4 laps" in root.find("g:trk/g:desc", ns).text


@pytest.mark.parametrize(
    "body",
    [
        {"laps": 0},
        {"distance": 200, "laps": 101},
        {"laps": 2.5},
        {"distance": 5, "laps": 3},
        {"mode": "point", "laps": 2},
    ],
)
def test_invalid_lap_requests(client, body):
    assert client.post("/api/routes", json=body).status_code == 422


def test_small_lap_boundary_and_point_default():
    assert Plan(radius_km=5, distance=24, laps=12).distance / 12 == 2
    assert Plan(radius_km=5, mode="point").laps == 1


def test_projection_starts_midroad_and_does_not_mutate_cached_graph(graph):
    original_nodes, original_edges = dict(graph.nodes), list(graph.edges)
    p = Plan(
        radius_km=5,
        mode="point",
        start_coordinates=(28.1817, -25.89311),
        destination_coordinates=(28.1867, -25.89311),
    )
    route = graph.routes(p)["routes"][0]
    assert 9 < route["snap_start_m"] < 11
    assert km(p.start_coordinates, route["coordinates"][0]) * 1000 <= 20
    assert km(p.destination_coordinates, route["coordinates"][-1]) * 1000 <= 20
    assert abs(route["coordinates"][0][0] - p.start_coordinates[0]) < 1e-9
    assert abs(route["coordinates"][0][1] + 25.8932) < 1e-9
    assert graph.nodes == original_nodes and graph.edges == original_edges


def test_twenty_metre_limit_rejects_instead_of_moving_start(graph):
    for metres in (19.9, 20.1):
        point = (
            28.1817,
            -25.8932 + metres / (km((28.1817, -25.8932), (28.1817, -25.8922)) * 1000) * 0.001,
        )
        network = graph.adjacency(Plan(radius_km=5))
        if metres < 20:
            node, gap = graph.snap(point, network)
            assert gap <= 20 and km(point, network.nodes[node]) * 1000 <= 20
        else:
            with pytest.raises(ValueError, match="20 m"):
                graph.snap(point, network)


@pytest.mark.parametrize("reverse", [False, True])
def test_two_points_on_same_oneway_preserve_direction_and_geometry(reverse):
    d = network()
    way = next(e for e in d["elements"] if e["type"] == "way")
    d["elements"] = [e for e in d["elements"] if e["type"] == "node"] + [way]
    way["tags"]["oneway"] = "-1" if reverse else "yes"
    g = Graph(d)
    adj = g.adjacency(Plan(radius_km=5))
    left, _ = g.snap((28.1752, -25.8932), adj)
    right, _ = g.snap((28.1782, -25.8932), adj)
    start, end = (right, left) if reverse else (left, right)
    path, _ = g.shortest(start, end, adj)
    assert abs(sum(e.length for e, _ in path) - km(adj.nodes[start], adj.nodes[end])) < 1e-6
    assert g.shortest(end, start, adj) is None


def test_interior_snap_does_not_bypass_private_access_or_gate():
    d = network()
    for e in d["elements"]:
        if e["type"] == "way" and e["nodes"] == [2, 3]:
            e["tags"]["access"] = "private"
    g = Graph(d)
    with pytest.raises(ValueError, match="20 m"):
        g.snap((28.1817, -25.8932), g.adjacency(Plan(radius_km=5)))
    d = network()
    d["elements"][1]["tags"] = {"barrier": "gate"}
    g = Graph(d)
    with pytest.raises(ValueError, match="20 m"):
        g.snap((28.1817, -25.8932), g.adjacency(Plan(radius_km=5)))


def test_rider_speed_changes_time_without_changing_path(graph):
    slow = graph.routes(Plan(radius_km=5, distance=28, laps=4, rider_speed_kmh=10))["routes"][0]
    fast = graph.routes(Plan(radius_km=5, distance=28, laps=4, rider_speed_kmh=20))["routes"][0]
    assert fast["coordinates"] == slow["coordinates"]
    assert abs(slow["duration"] - fast["duration"] * 2) <= 1
    assert slow["time_estimate"]["source"] == "rider-selected"
    assert slow["time_estimate"]["speed_kmh"] == 10
    assert not slow["time_estimate"]["hills_included"]
    assert not slow["time_estimate"]["training_data_used"]


@pytest.mark.parametrize(
    "body",
    [
        {"rider_speed_kmh": 0},
        {"rider_speed_kmh": 41},
        {"start_accuracy_m": 1500, "start_coordinates": [28.1892, -25.8782]},
    ],
)
def test_reject_invalid_speed_and_coarse_location(client, body):
    assert client.post("/api/routes", json=body).status_code == 422


def test_projection_does_not_connect_roads_crossing_without_shared_node():
    g = Graph(
        {
            "elements": [
                {"type": "node", "id": 1, "lon": 28.18, "lat": -25.88},
                {"type": "node", "id": 2, "lon": 28.20, "lat": -25.88},
                {"type": "node", "id": 3, "lon": 28.19, "lat": -25.89},
                {"type": "node", "id": 4, "lon": 28.19, "lat": -25.87},
                {"type": "way", "id": 11, "nodes": [1, 2], "tags": {"highway": "residential"}},
                {
                    "type": "way",
                    "id": 12,
                    "nodes": [3, 4],
                    "tags": {"highway": "residential", "bridge": "yes"},
                },
            ]
        }
    )
    adj = g.adjacency(Plan(radius_km=5))
    start, _ = g.snap((28.185, -25.88), adj)
    end, _ = g.snap((28.19, -25.885), adj)
    assert g.shortest(start, end, adj) is None


def test_local_radius_checks_every_shape_vertex(graph):
    from app.areas import contains_path

    origin = PLACES["highveld"]["coordinates"]
    p = Plan(stay_local=False, radius_km=0.7)
    assert graph.adjacency(p)
    assert all(
        km(origin, point) <= 0.7
        for entries in graph.adjacency(p).values()
        for _, edge, _, _ in entries
        for point in edge.points
    )
    assert not contains_path(
        {"kind": "radius", "point": origin, "radius_km": 0.5},
        [origin, (origin[0] + 0.03, origin[1]), origin],
    )


def test_polygon_filter_checks_full_line_and_holes():
    from app.areas import contains_path
    from shapely.geometry import Polygon

    polygon = Polygon([(0, 0), (4, 0), (4, 4), (0, 4)], holes=[[(1, 1), (3, 1), (3, 3), (1, 3)]])
    area = {"kind": "boundary", "polygon": polygon}
    assert contains_path(area, [(0.5, 0.5), (3.5, 0.5)])
    assert not contains_path(area, [(0.5, 2), (3.5, 2)])
    assert not contains_path(area, [(0.5, 0.5), (-1, 2), (3.5, 0.5)])


def test_missing_municipal_boundary_does_not_block_connected_roads(graph, tmp_path, monkeypatch):
    monkeypatch.setenv("VELD_AREA_PATH", str(tmp_path / "missing.json"))
    plan = Plan(start="rooihuiskraal", start_coordinates=graph.nodes[25], distance=7)
    routes = graph.routes(plan)["routes"]
    assert routes and routes[0]["locality"]["kind"] == "road_cell"


def test_suburb_boundaries_do_not_cut_the_road_network(graph, monkeypatch):
    from app import areas

    def unused_boundary(_):
        raise AssertionError("Routing must not read administrative polygons")

    monkeypatch.setattr(areas, "get_area", unused_boundary)
    plan = Plan(start_coordinates=graph.nodes[1])
    network = graph.adjacency(plan)
    start, _ = graph.snap(graph.nodes[1], network)
    end, _ = graph.snap(graph.nodes[3], network)
    assert graph.shortest(start, end, network)


@pytest.mark.parametrize(
    "tags",
    [
        {"highway": "primary"},
        {"highway": "secondary_link"},
        {"highway": "residential", "maxspeed": "80"},
        {"highway": "residential", "maxspeed": "45 mph"},
    ],
)
def test_main_road_filter_is_explicit_and_applies_to_wider_rides(tags):
    assert not eligible(tags, Plan(stay_local=False, radius_km=5))
    assert eligible(tags, Plan(avoid_main_roads=False))
    assert not eligible(tags | {"access": "private"}, Plan(avoid_main_roads=False))


def test_location_resolver_returns_exact_road_proof(client):
    point = (28.18925, -25.87815)
    result = client.post(
        "/api/locations/resolve", json={"plan": {"start_coordinates": point, "radius_km": 5}}
    )
    assert result.status_code == 200
    match = result.json()
    assert match["road_name"].startswith("Fixture road")
    assert 0 < match["snap_distance_m"] <= 20
    assert km(point, match["coordinates"]) * 1000 <= 20
    bad = client.post(
        "/api/locations/resolve",
        json={"plan": {"start_coordinates": (28.1917, -25.8807), "radius_km": 5}},
    )
    assert bad.status_code == 422


def test_edit_visits_every_point_and_preserves_loop_access(graph):
    vias = [graph.nodes[11], graph.nodes[39]]
    p = Plan(distance=7, radius_km=5, via_points=vias)
    route = graph.routes(p)["routes"][0]
    assert route["edited"]
    assert route["coordinates"][0] == route["coordinates"][-1]
    cursor = 0
    for point in vias:
        cursor = next(
            i
            for i in range(cursor, len(route["coordinates"]))
            if km(point, route["coordinates"][i]) * 1000 <= 20
        )
    assert all(eligible(s["tags"], p) for s in route["navigation"]["segments"])
    assert all(km(p.point("start"), c) <= 5 for c in route["coordinates"])


def test_edit_cannot_snap_to_distant_or_excluded_road(graph):
    with pytest.raises(ValueError, match="within 20 m"):
        graph.routes(Plan(radius_km=5, distance=7, via_points=[(28.1917, -25.8807)]))
    edge = graph.edges[0]
    a, b = edge.points[0], edge.points[-1]
    midpoint = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    with pytest.raises(ValueError, match="within 20 m"):
        graph.routes(Plan(radius_km=5, distance=7, avoid_ways=[edge.way], via_points=[midpoint]))
    with pytest.raises(ValueError, match="outside your selected riding area"):
        graph.routes(Plan(stay_local=False, radius_km=0.7, distance=7, via_points=[graph.nodes[1]]))


def test_turn_restriction_applies_across_editing_point():
    payload = network()
    ways = [e for e in payload["elements"] if e["type"] == "way"]
    frm = next(w for w in ways if w["nodes"] == [1, 2])
    to = next(w for w in ways if w["nodes"] == [2, 3])
    payload["elements"].append(
        {
            "type": "relation",
            "id": 99,
            "tags": {"type": "restriction", "restriction": "no_straight_on"},
            "members": [
                {"type": "way", "role": "from", "ref": frm["id"]},
                {"type": "node", "role": "via", "ref": 2},
                {"type": "way", "role": "to", "ref": to["id"]},
            ],
        }
    )
    g = Graph(payload)
    route = g.routes(
        Plan(
            mode="point",
            start_coordinates=g.nodes[1],
            destination_coordinates=g.nodes[3],
            via_points=[g.nodes[2]],
            radius_km=5,
        )
    )["routes"][0]
    way_ids = [s["way_id"] for s in route["navigation"]["segments"]]
    assert not any(a == frm["id"] and b == to["id"] for a, b in zip(way_ids, way_ids[1:]))


def test_android_export_exact_geometry_cues_and_all_laps(client, monkeypatch):
    route = client.post("/api/routes", json={"radius_km": 5, "distance": 28, "laps": 4}).json()[
        "routes"
    ][0]
    monkeypatch.setattr(
        osm, "get_graph", lambda: (_ for _ in ()).throw(RuntimeError("offline graph"))
    )
    ns = {"g": "http://www.topografix.com/GPX/1/1"}
    for choice, count in [("single", 1), ("all", 4)]:
        response = client.get(f"/api/routes/{route['id']}/gpx?format=osmand&laps={choice}")
        assert response.status_code == 200
        root = ElementTree.fromstring(response.content)
        assert len(root.findall("g:rte", ns)) == count
        tracks = root.findall(".//g:trkseg", ns)
        assert len(tracks) == count
        for trk in tracks:
            points = [
                [float(p.attrib["lon"]), float(p.attrib["lat"])] for p in trk.findall("g:trkpt", ns)
            ]
            assert points == route["coordinates"]
            segments = trk.findall("g:extensions/g:route/g:segment", ns)
            types = trk.findall("g:extensions/g:types/g:type", ns)
            assert sum(int(s.attrib["length"]) for s in segments) - (len(segments) - 1) == len(
                points
            )
            for segment in segments:
                name = types[int(segment.attrib["names"])]
                assert name.attrib["t"] == "name"
                assert int(segment.attrib["id"]) > 0
            assert any(s.attrib.get("turnType") in {"TL", "TR"} for s in segments)
        for rte in root.findall("g:rte", ns):
            assert [int(p.text) for p in rte.findall("g:rtept/g:extensions/g:trkpt_idx", ns)] == [
                0,
                len(route["coordinates"]) - 1,
            ]


def test_turn_cues_use_driving_direction_and_do_not_invent_roundabout_exits():
    from app.navigation import navigation, turn
    from app.osm import Edge

    assert turn(90) == ("TR", "Turn right")
    assert turn(-90) == ("TL", "Turn left")
    p = Plan()
    path = [
        (
            Edge(
                "a",
                1,
                1,
                2,
                ((28.18, -25.88), (28.181, -25.88)),
                0.1,
                {"highway": "residential", "name": "A"},
            ),
            False,
        ),
        (
            Edge(
                "b",
                2,
                2,
                3,
                ((28.181, -25.88), (28.181, -25.881)),
                0.1,
                {"highway": "residential", "junction": "roundabout"},
            ),
            False,
        ),
    ]
    nav = navigation(path, p)
    assert nav["roundabouts_need_review"]
    assert "Enter roundabout" in nav["cues"][1]["instruction"]
    assert not any(s.get("turn", "").startswith("RN") for s in nav["segments"])


def test_area_pack_retains_restricted_road_tags_but_separates_eligible_roads(
    client, tmp_path, monkeypatch
):
    from io import BytesIO
    from zipfile import ZipFile
    from shapely.geometry import box, mapping

    payload = network()
    way = next(e for e in payload["elements"] if e["type"] == "way")
    way["tags"]["access"] = "private"
    road_file = tmp_path / "roads.json"
    road_file.write_text(json.dumps(payload))
    monkeypatch.setenv("OSM_DATA_PATH", str(road_file))
    monkeypatch.setattr(osm, "get_graph", lambda: Graph(payload))
    monkeypatch.setitem(PLACES, "rooihuiskraal", PLACES["highveld"])
    feature = {
        "type": "Feature",
        "properties": {"name": "Rooihuiskraal"},
        "geometry": mapping(box(28.173, -25.894, 28.205, -25.862)),
    }
    info = {
        "id": "rooihuiskraal",
        "name": "Rooihuiskraal",
        "source": "Fixture municipal source",
        "source_url": "https://example.invalid/gis",
        "downloaded_at": "2026-09-08T00:00:00Z",
        "anchor": PLACES["highveld"]["coordinates"],
        "anchor_road": "Fixture road",
        "boundary": feature,
        "source_features": [feature],
    }
    area_file = tmp_path / "area.json"
    area_file.write_text(json.dumps(info))
    monkeypatch.setenv("VELD_AREA_PATH", str(area_file))
    response = client.get("/api/areas/rooihuiskraal/download")
    assert response.status_code == 200
    with ZipFile(BytesIO(response.content)) as archive:
        assert "field-checks.csv" in archive.namelist()
        roads = json.loads(archive.read("roads.geojson"))["features"]
        assert any(r["properties"].get("access") == "private" for r in roads)
        eligible_roads = json.loads(archive.read("eligible-road-segments.geojson"))["features"]
        assert all(r["properties"]["osm_way_id"] != way["id"] for r in eligible_roads)
        assert not json.loads(archive.read("manifest.json"))["field_verified"]
        assert "OpenStreetMap contributors" in archive.read("README.txt").decode()


def test_municipal_import_excludes_noord_and_unregistered_extensions():
    from scripts.download_area import boundary_record
    from shapely.geometry import box, mapping, shape, Point

    feature = {
        "type": "Feature",
        "properties": {"name": "ROOIHUISKRAAL", "status_lu_text": "Registered"},
        "geometry": mapping(box(28.15, -25.90, 28.16, -25.89)),
    }
    noord = {
        "type": "Feature",
        "properties": {"name": "ROOIHUISKRAAL NOORD", "status_lu_text": "Registered"},
        "geometry": mapping(box(28.14, -25.88, 28.15, -25.87)),
    }
    unregistered = {
        "type": "Feature",
        "properties": {"name": "ROOIHUISKRAAL", "status_lu_text": "Proposed"},
        "geometry": noord["geometry"],
    }
    record = boundary_record({"features": [feature, noord, unregistered]})
    assert len(record["source_features"]) == 1
    assert not shape(record["boundary"]["geometry"]).covers(Point(28.145, -25.875))


def test_android_speed_override_changes_time_only(client):
    route = client.post("/api/routes", json={"radius_km": 5, "distance": 7}).json()["routes"][0]
    ns = {"g": "http://www.topografix.com/GPX/1/1"}
    times = []
    for speed in [10, 20]:
        response = client.get(f"/api/routes/{route['id']}/gpx?format=osmand&speed_kmh={speed}")
        assert response.status_code == 200
        root = ElementTree.fromstring(response.content)
        assert [
            [float(p.attrib["lon"]), float(p.attrib["lat"])] for p in root.findall(".//g:trkpt", ns)
        ] == route["coordinates"]
        times.append(sum(float(s.attrib["segmentTime"]) for s in root.findall(".//g:segment", ns)))
    assert times[0] == pytest.approx(times[1] * 2, abs=0.1)
    assert client.get(f"/api/routes/{route['id']}/gpx?format=osmand&speed_kmh=0").status_code == 422


@pytest.mark.parametrize("distance,laps", [(90, 21), (180, 42), (200, 95)])
def test_long_training_ride_totals_and_exports(client, distance, laps):
    response = client.post(
        "/api/routes",
        json={"distance": distance, "laps": laps, "radius_km": 5, "rider_speed_kmh": 25},
    )
    assert response.status_code == 200
    routes = response.json()["routes"]
    assert routes
    route = routes[0]
    actual_lap = sum(km(a, b) for a, b in zip(route["coordinates"], route["coordinates"][1:]))
    assert route["laps"] == laps
    assert abs(actual_lap * laps - distance) <= distance * 0.03
    assert route["distance_m"] == round(actual_lap * laps * 1000)
    assert route["duration"] == round(actual_lap * laps / 25 * 60)
    assert route["coordinates"][0] == route["coordinates"][-1]
    assert all(km(PLACES["highveld"]["coordinates"], c) <= 5 for c in route["coordinates"])
    exported = client.get(f"/api/routes/{route['id']}/gpx?format=osmand&laps=all&speed_kmh=25")
    assert exported.status_code == 200
    ns = {"g": "http://www.topografix.com/GPX/1/1"}
    root = ElementTree.fromstring(exported.content)
    segments = root.findall(".//g:trkseg", ns)
    assert len(segments) == laps
    assert len(root.findall("g:rte", ns)) == laps
    for segment in segments:
        assert [
            [float(p.attrib["lon"]), float(p.attrib["lat"])] for p in segment.findall("g:trkpt", ns)
        ] == route["coordinates"]
    assert len(root.findall(".//g:trkpt", ns)) == len(route["coordinates"]) * laps


@pytest.mark.parametrize(
    "body", [{"distance": 201}, {"distance": 200, "laps": 101}, {"distance": 180, "laps": 91}]
)
def test_long_training_ride_limits(client, body):
    assert client.post("/api/routes", json=body).status_code == 422
