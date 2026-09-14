"""Run the private API and web app together; Ctrl+C stops both."""

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


WEB_URL = "http://localhost:5173"


def running():
    try:
        for url in ("http://127.0.0.1:8000/api/health", "http://127.0.0.1:5173/api/health"):
            with urllib.request.urlopen(url, timeout=1) as response:
                status = json.load(response)
                if (
                    not isinstance(status, dict)
                    or status.get("mode") != "osm-local"
                    or status.get("coverage") != "Centurion"
                ):
                    return False
        with urllib.request.urlopen("http://127.0.0.1:5173", timeout=1) as response:
            return "<title>Verge" in response.read(16384).decode("utf-8", errors="replace")
    except (OSError, ValueError):
        return False


def open_browser():
    if not (os.getenv("DISPLAY") or os.getenv("WAYLAND_DISPLAY")):
        print(f"Open {WEB_URL} in your browser.", flush=True)
        return
    try:
        opened = webbrowser.open(WEB_URL, new=2)
    except webbrowser.Error:
        opened = False
    if not opened:
        print(f"Your browser could not be opened automatically. Open {WEB_URL}.", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Start Verge locally; Ctrl+C stops its services.")
    parser.add_argument(
        "--browser",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Open the browser when Verge is ready (use --no-browser to skip).",
    )
    args = parser.parse_args()
    if running():
        print(f"Verge is already running: {WEB_URL}. Stop it in its original terminal.", flush=True)
        if args.browser:
            open_browser()
        return 0
    for port in (8000, 5173):
        with socket.socket() as sock:
            sock.settimeout(1)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                print(
                    f"Port {port} is already in use, but Verge is not fully ready. Wait a moment and retry, or stop the earlier Verge terminal with Ctrl+C. See START_HERE.md. Nothing was stopped.",
                    file=sys.stderr,
                )
                return 1
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
        ready = False
        deadline = time.monotonic() + 60
        while all(child.poll() is None for child in children):
            if not ready:
                ready = running()
                if ready:
                    print(f"Ready: {WEB_URL}", flush=True)
                    if args.browser:
                        open_browser()
                elif time.monotonic() >= deadline:
                    print(
                        "Verge did not become ready within 60 seconds. Check the log and START_HERE.md.",
                        file=sys.stderr,
                    )
                    return 1
            time.sleep(0.5)
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
