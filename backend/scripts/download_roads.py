"""Run from repository root: .venv/bin/python backend/scripts/download_roads.py"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.osm import download_extract, status  # noqa: E402

if __name__ == "__main__":
    download_extract()
    result = status()
    print(result)
    if result.get("error"):
        raise SystemExit(1)
