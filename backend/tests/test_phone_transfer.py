"""Transfer tests bind only to loopback and use a temporary database."""

import time
import httpx
import pytest
from fastapi.testclient import TestClient
from app import main, osm, phone_transfer
from app.osm import Graph
from test_pilot import network


@pytest.fixture
def client(tmp_path, monkeypatch):
    graph = Graph(network())
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "transfer.db"))
    monkeypatch.setattr(osm, "get_graph", lambda: graph)
    monkeypatch.setattr(
        phone_transfer, "interfaces", lambda: [{"address": "127.0.0.1", "name": "test-loopback"}]
    )
    phone_transfer.stop()
    with TestClient(main.app) as client:
        yield client, graph
    phone_transfer.stop()


def selected_route(client, graph):
    response = client.post(
        "/api/routes", json={"start_coordinates": graph.nodes[25], "best_fit": True, "distance": 20}
    )
    assert response.status_code == 200
    return response.json()["routes"][0]


def transfer(client, route, **options):
    response = client.post(
        f"/api/routes/{route['id']}/transfer", json={"address": "127.0.0.1", **options}
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_qr_listener_serves_only_selected_exact_gpx_and_can_close(client):
    api, graph = client
    route = selected_route(api, graph)
    link = transfer(api, route, laps="single", speed_kmh=19)
    assert len(link["id"]) == 32
    assert 590 < link["expires_at"] - time.time() <= 600
    with httpx.Client(trust_env=False) as browser:
        page = browser.get(link["url"])
        assert page.status_code == 200 and "Download for OsmAnd" in page.text
        assert "1 lap" in page.text
        document = browser.get(link["url"] + "/route.gpx")
        expected = api.get(f"/api/routes/{route['id']}/gpx?format=osmand&laps=single&speed_kmh=19")
        assert document.content == expected.content
        assert document.headers["cache-control"] == "no-store"
        assert document.headers["referrer-policy"] == "no-referrer"
        base = link["url"].split("/r/")[0]
        for path in (
            "/",
            "/api/privacy/export",
            "/api/routes",
            "/r/wrong/route.gpx",
            "/../../data/pilot.db",
        ):
            assert browser.get(base + path).status_code == 404
        assert browser.get(link["url"], headers={"Host": "untrusted.example"}).status_code == 404
        assert browser.post(link["url"], json={}).status_code == 501
    assert api.delete(f"/api/transfer/{link['id']}").status_code == 200
    with pytest.raises(httpx.ConnectError):
        httpx.get(link["url"], trust_env=False, timeout=2)


def test_new_transfer_replaces_old_and_wrong_close_id_cannot_close_new(client):
    api, graph = client
    route = selected_route(api, graph)
    old = transfer(api, route)
    new = transfer(api, route)
    api.delete(f"/api/transfer/{old['id']}")
    with pytest.raises(httpx.ConnectError):
        httpx.get(old["url"], trust_env=False, timeout=2)
    assert httpx.get(new["url"], trust_env=False).status_code == 200


def test_expiry_closes_listener(client, monkeypatch):
    api, graph = client
    route = selected_route(api, graph)
    monkeypatch.setattr(phone_transfer, "TTL_SECONDS", 0.1)
    link = transfer(api, route)
    active = phone_transfer._active
    active.timer.join(timeout=3)
    assert not active.timer.is_alive() and active.closed
    with pytest.raises(httpx.ConnectError):
        httpx.get(link["url"], trust_env=False, timeout=2)


@pytest.mark.parametrize("action", ["block", "delete"])
def test_private_record_changes_revoke_transfer(client, action):
    api, graph = client
    route = selected_route(api, graph)
    link = transfer(api, route)
    if action == "delete":
        response = api.delete("/api/privacy/data", headers={"X-Verge-Local-Action": "1"})
    else:
        a, b = graph.nodes[26], graph.nodes[27]
        preview = api.post(
            "/api/access-blocks/resolve", json={"coordinates": [(a[0] + b[0]) / 2, a[1]]}
        ).json()
        response = api.post("/api/access-blocks", json=preview)
    assert response.status_code in {200, 201}
    with pytest.raises(httpx.ConnectError):
        httpx.get(link["url"], trust_env=False, timeout=2)


def test_transfer_cannot_choose_an_arbitrary_bind_address_or_expose_blocked_route(client):
    api, graph = client
    route = selected_route(api, graph)
    for address in ("0.0.0.0", "8.8.8.8", "malicious.example"):
        assert (
            api.post(f"/api/routes/{route['id']}/transfer", json={"address": address}).status_code
            == 422
        )
    s = route["navigation"]["segments"][1]
    a, b = route["coordinates"][s["index"] : s["index"] + 2]
    preview = api.post(
        "/api/access-blocks/resolve", json={"coordinates": [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]}
    ).json()
    assert api.post("/api/access-blocks", json=preview).status_code == 201
    assert (
        api.post(f"/api/routes/{route['id']}/transfer", json={"address": "127.0.0.1"}).status_code
        == 409
    )
    assert phone_transfer._active is None


def test_disabled_container_transfer_stays_closed(client, monkeypatch):
    api, graph = client
    route = selected_route(api, graph)
    monkeypatch.setenv("VERGE_PHONE_TRANSFER_DISABLED", "1")
    assert api.get("/api/transfer/interfaces").json() == []
    assert (
        api.post(f"/api/routes/{route['id']}/transfer", json={"address": "127.0.0.1"}).status_code
        == 422
    )
    assert phone_transfer._active is None
