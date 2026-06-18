#!/usr/bin/env python3
import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

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

    def request_origin(self):
        origin = self.headers.get("Origin")
        if origin and origin != "null":
            return origin
        referer = self.headers.get("Referer")
        if referer:
            parsed = urlparse(referer)
            if parsed.scheme and parsed.netloc:
                return f"{parsed.scheme}://{parsed.netloc}"
        return ""

    def origin_allowed(self, allow_empty=True):
        origin = self.request_origin()
        return (allow_empty and not origin) or origin in ALLOWED_ORIGINS

    def refresh_allowed(self):
        return self.origin_allowed(allow_empty=False)

    def cors_origin(self):
        origin = self.request_origin()
        if origin in ALLOWED_ORIGINS:
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

    def send_html(self, status, body):
        raw = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def send_popup_result(self, status, body, query):
        target_origin = query.get("origin", ["https://zhanaodu.github.io"])[0]
        if target_origin not in ALLOWED_ORIGINS:
            target_origin = "https://zhanaodu.github.io"
        result = json.dumps(body, ensure_ascii=False).replace("</", "<\\/")
        target = json.dumps(target_origin)
        title = "刷新完成" if body.get("ok") else "刷新失败"
        message = "飞书数据已刷新，可以关闭此窗口。" if body.get("ok") else body.get("error", "刷新失败")
        html = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: #080a0f; color: #f7f4e8; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }}
    main {{ width: min(360px, calc(100vw - 32px)); padding: 24px; border: 1px solid rgba(255, 210, 28, .28); border-radius: 8px; background: #11151d; }}
    h1 {{ margin: 0 0 10px; color: #ffd21c; font-size: 22px; }}
    p {{ margin: 0; color: #c8c3a8; line-height: 1.6; }}
  </style>
</head>
<body>
  <main>
    <h1>{title}</h1>
    <p>{message}</p>
  </main>
  <script>
    const result = {result};
    if (window.opener) {{
      window.opener.postMessage(Object.assign({{ type: "chicago-dashboard-refresh" }}, result), {target});
      window.setTimeout(() => window.close(), 900);
    }}
  </script>
</body>
</html>"""
        self.send_html(status, html)

    def do_OPTIONS(self):
        if not self.origin_allowed():
            self.send_json(403, {"ok": False, "error": "Origin is not allowed"})
            return
        self.send_json(200, {"ok": True})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json(200, {"ok": True, "service": "refresh", "root": str(ROOT)})
            return
        if parsed.path != "/refresh":
            self.send_json(404, {"ok": False, "error": "Not found"})
            return
        if not self.refresh_allowed():
            self.send_html(403, "<!doctype html><meta charset='utf-8'><title>403</title><p>Origin is not allowed.</p>")
            return
        status, body = self.run_refresh()
        self.send_popup_result(status, body, parse_qs(parsed.query))

    def do_POST(self):
        if self.path != "/refresh":
            self.send_json(404, {"ok": False, "error": "Not found"})
            return
        if not self.refresh_allowed():
            self.send_json(403, {"ok": False, "error": "Origin is not allowed"})
            return
        status, body = self.run_refresh()
        self.send_json(status, body)

    def run_refresh(self):
        if not refresh_lock.acquire(blocking=False):
            return 409, {"ok": False, "error": "Refresh already running"}

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
            return 200 if proc.returncode == 0 else 500, {
                "ok": proc.returncode == 0,
                "returnCode": proc.returncode,
                "payload": payload,
                "stdout": tail(proc.stdout),
                "stderr": tail(proc.stderr),
            }
        except subprocess.TimeoutExpired as exc:
            return 504, {
                "ok": False,
                "error": f"Refresh timed out after {TIMEOUT}s",
                "stdout": tail(exc.stdout or ""),
                "stderr": tail(exc.stderr or ""),
            }
        except Exception as exc:
            return 500, {"ok": False, "error": str(exc)}
        finally:
            refresh_lock.release()


def main():
    httpd = ThreadingHTTPServer((HOST, PORT), RefreshHandler)
    print(f"Refresh server listening on http://{HOST}:{PORT}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
