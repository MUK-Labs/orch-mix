#!/usr/bin/env python3
"""Serve the app only, on loopback. Audio is opened by the browser file picker."""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
ASSETS = {
    "index.html": "text/html; charset=utf-8",
    "app/style.css": "text/css; charset=utf-8",
    "app/app.js": "text/javascript; charset=utf-8",
    "app/model.js": "text/javascript; charset=utf-8",
    "app/layout.js": "text/javascript; charset=utf-8",
    "app/audio-engine.js": "text/javascript; charset=utf-8",
    "docs/LOCAL-USE.md": "text/plain; charset=utf-8",
    "docs/AUDIO-SOURCES.md": "text/plain; charset=utf-8",
    "docs/SESSION-FORMAT.md": "text/plain; charset=utf-8",
    "examples/beethoven-layout.json": "application/json; charset=utf-8",
}


class AppHandler(BaseHTTPRequestHandler):
    server_version = "OrchMixLocal/1"

    def do_GET(self):
        self.send_asset(head_only=False)

    def do_HEAD(self):
        self.send_asset(head_only=True)

    def send_asset(self, head_only):
        # Exact allowlist: no directory listings, uploads, repository metadata,
        # project files or recordings are ever served.
        path = unquote(urlsplit(self.path).path)
        key = "index.html" if path == "/" else path.removeprefix("/")
        allowed_host = {f"127.0.0.1:{self.server.server_port}",
                        f"localhost:{self.server.server_port}"}
        if self.headers.get("Host", "") not in allowed_host:
            self.send_error(403, "Local host only")
            return
        target = ROOT / key
        if (key not in ASSETS or not target.is_file()
                or target.resolve() != target.absolute()):
            self.send_error(404)
            return
        try:
            content = target.read_bytes()
        except OSError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ASSETS[key])
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.end_headers()
        if not head_only:
            self.wfile.write(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if not (ROOT / "index.html").is_file():
        parser.error("index.html is missing; run from a complete checkout")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), AppHandler)
    except OSError as exc:
        parser.exit(1, f"Cannot start local server: {exc}\nTry --port 8766.\n")
    url = f"http://127.0.0.1:{args.port}/"
    print(f"Orch Mix: {url}\nOnly app assets are served. Ctrl+C stops the server.")
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
