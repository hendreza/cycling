"""Regenerate locally bundled software notices from installed dependencies."""

import importlib.metadata
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "frontend/public/licenses"
LOCK = json.loads((ROOT / "frontend/package-lock.json").read_text())
records, notices = [], []
for location, entry in LOCK["packages"].items():
    if not location:
        continue
    base = ROOT / "frontend" / location
    package = base / "package.json"
    if not package.exists():
        continue
    meta = json.loads(package.read_text())
    name = meta.get("name", location)
    record = {
        "ecosystem": "npm",
        "name": name,
        "version": meta.get("version"),
        "licence": meta.get("license", entry.get("license", "Review required")),
        "development_only": bool(entry.get("dev")),
    }
    records.append(record)
    for path in sorted(base.iterdir()):
        if path.is_file() and path.name.lower().startswith(
            ("license", "licence", "copying", "notice")
        ):
            notices.append(
                f"{name} {record['version']} — {path.name}\n{'=' * 60}\n{path.read_text(errors='replace')}"
            )
for dist in sorted(
    importlib.metadata.distributions(), key=lambda d: d.metadata.get("Name", "").lower()
):
    meta = dist.metadata
    licence = (
        meta.get("License-Expression")
        or meta.get("License")
        or next(
            (
                x.split(" :: ")[-1]
                for x in meta.get_all("Classifier", [])
                if x.startswith("License ::")
            ),
            "Review required",
        )
    )
    records.append(
        {"ecosystem": "python", "name": meta["Name"], "version": dist.version, "licence": licence}
    )
    for file in dist.files or []:
        if Path(file).name.lower().startswith(("license", "licence", "copying", "notice")):
            path = Path(dist.locate_file(file))
            if path.is_file():
                notices.append(
                    f"{meta['Name']} {dist.version} — {Path(file).name}\n{'=' * 60}\n{path.read_text(errors='replace')}"
                )
DEST.mkdir(exist_ok=True, parents=True)
(DEST / "dependencies.json").write_text(
    json.dumps(
        {
            "scope": "Installed frontend and Python environment, including development tools; review against the release build before distribution.",
            "dependencies": records,
        },
        indent=2,
    )
    + "\n"
)
(DEST / "THIRD_PARTY_NOTICES.txt").write_text("\n\n".join(notices) + "\n")
print(f"Wrote {len(records)} dependency records and {len(notices)} licence notices.")
