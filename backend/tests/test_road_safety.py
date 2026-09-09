"""Physical road barriers, candidate priority and score provenance."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from app import osm
from app.main import app, db
from app.osm import Graph
from app.road_safety import assessment, safety_rank
from app.routing import Plan, km
from test_pilot import network


def crossing(shared=True, major_tags=None, side_tags=None):
    nodes = [
        (1, 28.18, -25.88),
        (2, 28.19, -25.88),
        (3, 28.20, -25.88),
        (4, 28.19, -25.89),
        (5, 28.19, -25.87),
    ]
    return Graph(
        {
            "elements": [
                *[{"type": "node", "id": n, "lon": x, "lat": y} for n, x, y in nodes],
                {
                    "type": "way",
                    "id": 10,
                    "nodes": [1, 2, 3] if shared else [1, 3],
                    "tags": {
                        "highway": "residential",
                        "name": "Side road",
                        "surface": "asphalt",
                        **(side_tags or {}),
                    },
                },
                {
                    "type": "way",
                    "id": 20,
                    "nodes": [4, 2, 5] if shared else [4, 5],
                    "tags": {"highway": "secondary", "name": "Main road", **(major_tags or {})},
                },
            ]
        }
    )


def test_major_junction_separates_local_roads_without_using_the_major_road():
    graph = crossing()
    local = graph.adjacency(Plan())
    assert graph.shortest(1, 3, local) is None
    assert 2 not in graph.reachable(1, local)
    nearby = graph.adjacency(Plan(stay_local=False, radius_km=5))
    path, _ = graph.shortest(1, 3, nearby)
    assert {edge.way for edge, _ in path} == {10}
    score = assessment(path, graph.barriers, graph.timestamp, laps=4)
    assert score["major_junctions_per_lap"] == 1
    assert score["major_junction_visits"] == 4
    assert score["score"] == 72


@pytest.mark.parametrize(
    "major_tags,side_tags,allowed",
    [
        ({}, {}, False),
        ({"bridge": "yes", "layer": "1"}, {}, True),
        ({}, {"tunnel": "yes", "layer": "-1"}, True),
        ({"layer": "1"}, {}, False),
        ({"bridge": "yes", "layer": "bad"}, {}, False),
        ({"bridge": "yes", "layer": "nan"}, {}, False),
        ({"bridge": "yes", "layer": "1"}, {"layer": "1"}, False),
    ],
)
def test_geometric_crossing_requires_unambiguous_grade_separation(major_tags, side_tags, allowed):
    graph = crossing(False, major_tags, side_tags)
    path = graph.shortest(1, 3, graph.adjacency(Plan()))
    assert bool(path) is allowed
    if allowed:
        score = assessment(path[0], graph.barriers, graph.timestamp)
        assert score["major_junctions_per_lap"] == 0
        assert score["separated_crossings"] == 1


def test_shared_junction_cannot_claim_bridge_separation():
    graph = crossing(True, {"bridge": "yes", "layer": "1"})
    assert graph.shortest(1, 3, graph.adjacency(Plan())) is None


def test_start_can_snap_inside_side_road_and_ride_away_from_barrier():
    graph = crossing()
    adjacency = graph.adjacency(Plan())
    start, gap = graph.snap((28.1899, -25.88), adjacency)
    assert gap == 0
    assert graph.shortest(start, 1, adjacency)
    assert graph.shortest(start, 3, adjacency) is None
    with pytest.raises(ValueError, match="major-road junction"):
        graph.snap(graph.nodes[2], adjacency)


@pytest.mark.parametrize("highway", ["motorway", "trunk", "motorway_link", "trunk_link"])
def test_critical_at_grade_crossings_stay_blocked_in_nearby_mode(highway):
    graph = crossing(True, {"highway": highway})
    adjacency = graph.adjacency(Plan(stay_local=False, radius_km=5, avoid_main_roads=False))
    assert graph.shortest(1, 3, adjacency) is None


def test_local_major_road_exclusion_applies_even_if_preference_disabled():
    graph = crossing()
    for mode in ("loop", "point"):
        adjacency = graph.adjacency(Plan(mode=mode, avoid_main_roads=False))
        assert all(edge.way != 20 for rows in adjacency.values() for _, edge, _, _ in rows)


def test_score_priority_is_strict_before_laps_then_distance():
    def route(score, laps, extra):
        return {
            "safety": {"score": score},
            "laps": laps,
            "distance_over_target_m": extra,
            "distance_m": 90000 + extra,
        }

    best = route(80, 40, 2000)
    fewer = route(80, 20, 1000)
    low = route(79.9, 1, 0)
    closest = route(80, 20, 100)
    assert sorted([low, best, fewer, closest], key=safety_rank) == [closest, fewer, best, low]


@pytest.mark.parametrize("distance", [20, 90, 180, 200])
def test_best_fit_completes_distance_and_preserves_closed_road_geometry(distance):
    graph = Graph(network())
    plan = Plan(start_coordinates=graph.nodes[25], best_fit=True, distance=distance)
    result = graph.routes(plan)
    assert result["routes"]
    for route in result["routes"]:
        actual = sum(km(a, b) for a, b in zip(route["coordinates"], route["coordinates"][1:]))
        assert actual >= 2
        assert distance - 1e-6 <= actual * route["laps"] <= distance * 1.03
        assert route["distance_m"] == round(actual * route["laps"] * 1000)
        assert route["coordinates"][0] == route["coordinates"][-1]
        assert km(route["coordinates"][0], plan.point("start")) * 1000 <= 20
        assert 1 <= route["laps"] <= 100
        assert route["safety"]["major_junctions_per_lap"] == 0
        assert route["selection"]["exhaustive"] is False
        assert route["selection"]["candidates_checked"] > 1
        # Road sections cover exactly one lap with a shared endpoint at joins.
        cursor = 0
        for section in route["sections"]:
            assert section["index"] == cursor
            cursor += section["count"] - 1
            assert 0 <= section["score"] <= 100
        assert cursor == len(route["coordinates"]) - 1


def test_only_current_approved_adverse_reports_affect_new_assessments(tmp_path, monkeypatch):
    graph = Graph(network())
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "reports.db"))
    monkeypatch.setattr(osm, "get_graph", lambda: graph)
    client = TestClient(app)
    a, b = graph.nodes[25], graph.nodes[26]
    midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    plan = {
        "mode": "point",
        "start_coordinates": a,
        "destination_coordinates": b,
        "via_points": [midpoint],
        "distance": 5,
    }
    before = client.post("/api/routes", json=plan).json()["routes"][0]
    way = before["navigation"]["segments"][0]["way_id"]
    now = datetime.now(timezone.utc)
    future = (now + timedelta(days=2)).isoformat()
    past = (now - timedelta(days=2)).isoformat()
    with db() as conn:
        for category, status, expiry, detail in [
            ("pothole", "pending", future, "Unreviewed observation"),
            ("pothole", "approved", past, "Expired observation"),
            ("good-surface", "approved", future, "Positive observation"),
            ("pothole", "rejected", future, "Rejected observation"),
        ]:
            conn.execute(
                "INSERT INTO reports(segment_id,category,detail,status,created_at,expires_at) VALUES(?,?,?,?,?,?)",
                (f"osm-way-{way}", category, detail, status, now.isoformat(), expiry),
            )
    unchanged = client.post("/api/routes", json=plan).json()["routes"][0]
    assert unchanged["safety"] == before["safety"]
    with db() as conn:
        conn.execute(
            "INSERT INTO reports(segment_id,category,detail,status,created_at,expires_at) VALUES(?,?,?,?,?,?)",
            (
                f"osm-way-{way}",
                "pothole",
                "A current reviewed road issue",
                "approved",
                now.isoformat(),
                future,
            ),
        )
    after = client.post("/api/routes", json=plan).json()["routes"][0]
    assert after["coordinates"] == before["coordinates"]
    assert after["safety"]["score"] == before["safety"]["score"] - 10
    assert len(after["safety"]["reports"]) == 1
    assert "Local road reports" in after["sections"][0]["concerns"]
    assert after["safety"]["unknowns"] == before["safety"]["unknowns"]
    with db() as conn:
        import json

        saved = json.loads(
            conn.execute("SELECT payload FROM saved_routes WHERE id=?", (before["id"],)).fetchone()[
                0
            ]
        )
    assert saved["safety"] == before["safety"]


def test_expanding_to_nearby_keeps_a_better_local_candidate():
    graph = Graph(network())
    plan = Plan(start_coordinates=graph.nodes[25], best_fit=True, distance=90)
    local = graph.routes(plan)["routes"][0]
    nearby = graph.routes(plan.model_copy(update={"stay_local": False, "radius_km": 5}))["routes"][
        0
    ]
    assert safety_rank(nearby) <= safety_rank(local)
    assert nearby["locality"]["kind"] == "radius"
    assert all(km(plan.point("start"), c) <= 5 for c in nearby["coordinates"])


def test_revisiting_a_junction_counts_every_encounter_without_double_counting_edge_joins():
    graph = crossing()
    adjacency = graph.adjacency(Plan(stay_local=False, radius_km=5))
    outbound = graph.shortest(1, 3, adjacency)[0]
    back = graph.shortest(3, 1, adjacency)[0]
    score = assessment(outbound + back, graph.barriers, graph.timestamp, laps=3)
    assert score["major_junctions_per_lap"] == 1
    assert score["major_junction_visits_per_lap"] == 2
    assert score["major_junction_visits"] == 6


@pytest.mark.parametrize(
    "tags",
    [
        {"maxspeed:forward": "80"},
        {"maxspeed:backward": "45 mph"},
        {"maxspeed": "60;80"},
        {"maxspeed": "70 km/h"},
    ],
)
def test_speed_barriers_and_road_exclusions_use_the_same_mapped_evidence(tags):
    from app.osm import eligible
    from app.road_safety import major_road, mapped_speed

    tags = {"highway": "residential", **tags}
    assert mapped_speed(tags) > 60
    assert major_road(tags)
    assert not eligible(tags, Plan(stay_local=False))
    assert eligible(tags, Plan(stay_local=False, avoid_main_roads=False))
