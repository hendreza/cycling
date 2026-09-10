"""Check the installed Centurion extract without changing the private route DB."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import osm
from app.routing import Plan, km
from app.loop_search import fingerprint


def verify():
    graph = osm.get_graph()
    rows, seen = [], []
    for distance, coverage, cap, variation in [
        (20, "local", 100, 0),
        (90, "centurion", 3, 0),
        (180, "centurion", 6, 0),
        (200, "centurion", 6, 0),
        (90, "centurion", 3, 1),
        (90, "centurion", 1, 0),
    ]:
        p = Plan(
            start="rooihuiskraal",
            distance=distance,
            best_fit=True,
            coverage=coverage,
            max_laps=cap,
            variation=variation,
            exclude_routes=seen if variation else [],
        )
        began = perf_counter()
        result = graph.routes(p)
        options = []
        if cap != 1:
            assert result["routes"], (distance, cap, result["message"])
        for r in result["routes"]:
            loop = sum(km(a, b) for a, b in zip(r["coordinates"], r["coordinates"][1:]))
            assert distance - 1e-8 <= loop * r["laps"] <= distance * 1.03
            assert r["laps"] <= cap
            assert r["coordinates"][0] == r["coordinates"][-1]
            assert km(p.point("start"), r["coordinates"][0]) * 1000 <= 20
            assert r["fingerprint"] == fingerprint(r["coordinates"])
            assert r["elevation"] is None and r["score"] is None
            if coverage == "local":
                assert r["safety"]["major_junctions_per_lap"] == 0
            if variation:
                assert r["fingerprint"] not in seen
            options.append(
                {
                    "distance_km": r["distance"],
                    "loop_km": r["lap_distance"],
                    "laps": r["laps"],
                    "mapped_road_score": r["safety"]["score"],
                    "confidence": "low",
                    "major_junctions_per_lap": r["safety"]["major_junctions_per_lap"],
                    "fingerprint": r["fingerprint"],
                }
            )
        if distance == 90 and cap == 3 and not variation:
            seen = [r["fingerprint"] for r in result["routes"]]
        rows.append(
            {
                "requested_km": distance,
                "coverage": coverage,
                "max_laps": cap,
                "variation": variation,
                "seconds": round(perf_counter() - began, 2),
                "options": options,
                "limits": result["limits"],
            }
        )
        print(json.dumps(rows[-1]), flush=True)
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "osm_snapshot": graph.timestamp,
        "policy": osm.POLICY_VERSION,
        "scope": "Geometry and rule checks; not an on-bike or traffic assessment. Bounded search, not proof of the longest possible loop.",
        "cases": rows,
    }
    output = Path(__file__).resolve().parents[2] / "data/exports/verge-live-verification.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    verify()
