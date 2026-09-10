"""Run the private API and web app together; Ctrl+C stops both."""

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    node = shutil.which("node")
    if not node:
        installed = list((Path.home() / ".nvm/versions/node").glob("v22.*/bin/node"))
        installed.sort(key=lambda p: tuple(int(n) for n in p.parents[1].name[1:].split(".")))
        node = str(installed[-1]) if installed else None
    python = ROOT / ".venv/bin/python"
    vite = ROOT / "frontend/node_modules/vite/bin/vite.js"
    if not node or not python.exists() or not vite.exists():
        print("Install Python 3.13 / Node 22 and run make setup first.", file=sys.stderr)
        return 1
    environment = {
        **os.environ,
        "PATH": str(Path(node).parent) + os.pathsep + os.environ.get("PATH", ""),
    }
    commands = [
        (
            [
                str(python),
                "-m",
                "uvicorn",
                "app.main:app",
                "--app-dir",
                str(ROOT / "backend"),
                "--reload",
                "--reload-dir",
                str(ROOT / "backend/app"),
                "--host",
                "127.0.0.1",
                "--port",
                "8000",
            ],
            ROOT,
        ),
        (
            [node, str(vite), "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
            ROOT / "frontend",
        ),
    ]
    children = []
    try:
        for command, cwd in commands:
            children.append(subprocess.Popen(command, cwd=cwd, env=environment))
        print("Verge: http://localhost:5173 — Ctrl+C stops both services.", flush=True)
        while all(child.poll() is None for child in children):
            time.sleep(0.3)
        print(
            "A service stopped. Check the log above; ports 5173 and 8000 must be available.",
            file=sys.stderr,
        )
        return 1
    except KeyboardInterrupt:
        return 0
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == "__main__":
    raise SystemExit(main())
