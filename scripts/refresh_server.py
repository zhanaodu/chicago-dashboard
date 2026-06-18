#!/usr/bin/env python3
import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "assets" / "data.json"
SYNC_SCRIPT = ROOT / "scripts" / "sync_and_publish.sh"
HOST = os.environ.get("DASHBOARD_REFRESH_HOST", "127.0.0.1")
PORT = int(os.environ.get("DASHBOARD_REFRESH_PORT", "8794"))
TIMEOUT = int(os.environ.get("DASHBOARD_REFRESH_TIMEOUT", "240"))

DEFAULT_ALLOWED_ORIGINS = {
    "https://zhanaodu.github.io",
    "http://127.0.0.1:8791",
    "http://localhost:8791",
    "http://127.0.0.1:8792",
    "http://localhost:8792",
}
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get("DASHBOARD_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
} or DEFAULT_ALLOWED_ORIGINS

refresh_lock = threading.Lock()


def tail(text, limit=6000):
    if not text:
        return ""
    return text[-limit:]


def load_payload():
    if not DATA_PATH.exists():
        return None
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


class RefreshHandler(BaseHTTPRequestHandler):
    server_version = "ChicagoDashboardRefresh/1.0"

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def origin_allowed(self):
        origin = self.headers.get("Origin")
        return not origin or origin == "null" or origin in ALLOWED_ORIGINS

    def cors_origin(self):
        origin = self.headers.get("Origin")
        if origin and origin != "null" and origin in ALLOWED_ORIGINS:
            return origin
        return "*"

    def send_json(self, status, body):
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", self.cors_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        if not self.origin_allowed():
            self.send_json(403, {"ok": False, "error": "Origin is not allowed"})
            return
        self.send_json(200, {"ok": True})

    def do_GET(self):
        if self.path != "/health":
            self.send_json(404, {"ok": False, "error": "Not found"})
            return
        self.send_json(200, {"ok": True, "service": "refresh", "root": str(ROOT)})

    def do_POST(self):
        if self.path != "/refresh":
            self.send_json(404, {"ok": False, "error": "Not found"})
            return
        if not self.origin_allowed():
            self.send_json(403, {"ok": False, "error": "Origin is not allowed"})
            return
        if not refresh_lock.acquire(blocking=False):
            self.send_json(409, {"ok": False, "error": "Refresh already running"})
            return

        try:
            env = os.environ.copy()
            env.setdefault(
                "LARK_CLI",
                "/Users/mac/Library/Application Support/YarboChicagoDashboard/.tools/lark-cli/lark-cli",
            )
            proc = subprocess.run(
                ["/bin/sh", str(SYNC_SCRIPT)],
                cwd=ROOT,
                env=env,
                text=True,
                capture_output=True,
                timeout=TIMEOUT,
            )
            payload = load_payload()
            body = {
                "ok": proc.returncode == 0,
                "returnCode": proc.returncode,
                "payload": payload,
                "stdout": tail(proc.stdout),
                "stderr": tail(proc.stderr),
            }
            self.send_json(200 if proc.returncode == 0 else 500, body)
        except subprocess.TimeoutExpired as exc:
            self.send_json(504, {"ok": False, "error": f"Refresh timed out after {TIMEOUT}s", "stdout": tail(exc.stdout or ""), "stderr": tail(exc.stderr or "")})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})
        finally:
            refresh_lock.release()


def main():
    httpd = ThreadingHTTPServer((HOST, PORT), RefreshHandler)
    print(f"Refresh server listening on http://{HOST}:{PORT}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
