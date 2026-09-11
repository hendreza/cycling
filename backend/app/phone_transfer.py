"""Opt-in, expiring GPX-only transfer; the private API stays on loopback."""

import atexit
import fcntl
import html
import ipaddress
import secrets
import socket
import struct
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

TTL_SECONDS = 600
_lock = threading.RLock()
_active = None


def interfaces():
    result = []
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        for _, name in socket.if_nameindex():
            if name.startswith(("lo", "docker", "br-", "veth")):
                continue
            try:
                raw = fcntl.ioctl(sock.fileno(), 0x8915, struct.pack("256s", name.encode()[:15]))
                address = socket.inet_ntoa(raw[20:24])
                ip = ipaddress.ip_address(address)
                if ip.is_private and not ip.is_loopback and not ip.is_link_local:
                    result.append({"address": address, "name": name})
            except OSError:
                continue
    return result


class TransferServer(HTTPServer):
    allow_reuse_address = False

    def get_request(self):
        sock, peer = super().get_request()
        sock.settimeout(3)
        return sock, peer


class Transfer:
    def __init__(self, address, content, title, distance, laps):
        self.id = secrets.token_urlsafe(24)
        self.expires = time.time() + TTL_SECONDS
        self.content = content.encode() if isinstance(content, str) else content
        self.closed = False
        owner = self
        path = f"/r/{self.id}"

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                if (
                    owner.closed
                    or time.time() >= owner.expires
                    or self.headers.get("Host") != owner.host
                    or self.path not in {path, path + "/route.gpx"}
                ):
                    self.send_error(404)
                    return
                download = self.path.endswith("/route.gpx")
                body = owner.content if download else owner.page
                self.send_response(200)
                self.send_header(
                    "Content-Type",
                    "application/gpx+xml" if download else "text/html; charset=utf-8",
                )
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Referrer-Policy", "no-referrer")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header(
                    "Content-Security-Policy",
                    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
                )
                if download:
                    self.send_header(
                        "Content-Disposition", 'attachment; filename="verge-android-route.gpx"'
                    )
                self.end_headers()
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError, TimeoutError):
                    pass

        self.server = TransferServer((address, 0), Handler)
        self.host = f"{address}:{self.server.server_port}"
        self.url = f"http://{self.host}{path}"
        self.page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verge · Your ride</title><style>body{{font:18px system-ui;line-height:1.6;background:#f5ead8;color:#2f2a24;max-width:32rem;margin:3rem auto;padding:1.5rem}}h1{{color:#643312}}a.button{{display:block;background:#643312;color:#fff;padding:1rem;border-radius:1rem;text-align:center;text-decoration:none}}small{{font-size:.85rem}}</style><h1>Your ride is ready.</h1><p>{html.escape(title)}<br>{distance:g} km · {laps} lap{"s" if laps != 1 else ""}</p><a class="button" href="{path}/route.gpx">Download for OsmAnd</a><ol><li>Open the downloaded GPX with OsmAnd.</li><li>Choose Navigation and the cycling profile.</li></ol><p>Follow the imported track; select all segments for all laps. Check it matches your preview. OsmAnd recalculation can change the route.</p><small>This private link closes automatically. After downloading, your file remains on the phone. © OpenStreetMap contributors, ODbL.</small></html>'''.encode()
        self.thread = threading.Thread(
            target=self.server.serve_forever, kwargs={"poll_interval": 0.1}, daemon=True
        )
        self.thread.start()
        self.timer = threading.Timer(TTL_SECONDS, lambda: stop(self.id))
        self.timer.daemon = True
        self.timer.start()

    def close(self):
        self.closed = True
        self.content = b""
        self.timer.cancel()
        self.server.shutdown()
        self.server.server_close()


def stop(transfer_id=None):
    global _active
    with _lock:
        if _active and (transfer_id is None or transfer_id == _active.id):
            _active.close()
            _active = None


def create(address, content, title, distance, laps):
    global _active
    if address not in {item["address"] for item in interfaces()}:
        raise ValueError("Choose this computer’s Wi-Fi or local network address.")
    with _lock:
        stop()
        _active = Transfer(address, content, title, distance, laps)
        return {"id": _active.id, "url": _active.url, "expires_at": _active.expires}


atexit.register(stop)
