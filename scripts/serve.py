#!/usr/bin/env python3
"""Serve the app only, on loopback. Audio is opened by the browser file picker."""

import argparse
import errno
from http.client import HTTPConnection, HTTPException
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
from urllib.parse import unquote, urlsplit
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
ASSETS = {
    "index.html": "text/html; charset=utf-8",
    "start.html": "text/html; charset=utf-8",
    "app/guide.css": "text/css; charset=utf-8",
    "app/style.css": "text/css; charset=utf-8",
    "app/app.js": "text/javascript; charset=utf-8",
    "app/model.js": "text/javascript; charset=utf-8",
    "app/layout.js": "text/javascript; charset=utf-8",
    "app/audio-engine.js": "text/javascript; charset=utf-8",
    "app/library.js": "text/javascript; charset=utf-8",
    "app/midi.js": "text/javascript; charset=utf-8",
    "app/instruments.js": "text/javascript; charset=utf-8",
    "docs/LOCAL-USE.md": "text/plain; charset=utf-8",
    "docs/AUDIO-SOURCES.md": "text/plain; charset=utf-8",
    "docs/SESSION-FORMAT.md": "text/plain; charset=utf-8",
    "examples/beethoven-operation.orchmix.json": "application/json; charset=utf-8",
    "examples/mozart-spheres.orchmix.json": "application/json; charset=utf-8",
    "examples/tchaikovsky-spheres.orchmix.json": "application/json; charset=utf-8",
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


def existing_app_server(port):
    """Recognize our own server without opening an unrelated local service."""
    connection = HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        connection.request("HEAD", "/")
        response = connection.getresponse()
        return (response.status == 200
                and response.getheader("Server", "").split(" ", 1)[0]
                == AppHandler.server_version)
    except (OSError, HTTPException):
        return False
    finally:
        connection.close()


def open_app_browser(url, prefer_chromium=False):
    if prefer_chromium and sys.platform == "darwin":
        for app in ("Google Chrome", "Microsoft Edge"):
            try:
                result = subprocess.run(
                    ["open", "-a", app, url], check=False, timeout=5,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if result.returncode == 0:
                    return
            except (OSError, subprocess.TimeoutExpired):
                pass
        print("For saved folders and MIDI, open this address in Chrome or Edge.")
    try:
        if webbrowser.open(url):
            return
    except (OSError, webbrowser.Error):
        pass
    print(f"Open this address in your browser: {url}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--prefer-chromium", action="store_true",
                        help="on macOS, open Chrome or Edge before the default browser")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if not (ROOT / "index.html").is_file():
        parser.error("index.html is missing; run from a complete checkout")
    url = f"http://127.0.0.1:{args.port}/"
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), AppHandler)
    except OSError as exc:
        if exc.errno == errno.EADDRINUSE:
            if existing_app_server(args.port):
                print(f"Orch Mix is already running: {url}")
                if not args.no_browser:
                    open_app_browser(url, args.prefer_chromium)
                return
            parser.exit(1, f"Port {args.port} is occupied by another program.\n"
                        "Stop it and try again to keep the same saved folders and MIDI settings.\n"
                        "Choosing a different --port creates a separate browser setup.\n")
        parser.exit(1, f"Cannot start local server: {exc}\n")
    print(f"Orch Mix: {url}\nOnly app assets are served. Ctrl+C stops the server.")
    if not args.no_browser:
        open_app_browser(url, args.prefer_chromium)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
