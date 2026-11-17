"""Startup/relaunch checks; run with python3 tests/test_serve.py."""

import importlib.util
from html.parser import HTMLParser
from urllib.parse import urlsplit
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import signal
import socket
import subprocess
import sys
import threading
import time
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "serve.py"
SPEC = importlib.util.spec_from_file_location("orch_server", SCRIPT)
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class QuietHandler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, *_args):
        pass


class ServerTests(unittest.TestCase):
    def test_start_and_relaunch_keep_same_server(self):
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        command = [sys.executable, str(SCRIPT), "--no-browser", "--port", str(port)]
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and not SERVER.existing_app_server(port):
                if process.poll() is not None:
                    self.fail("Server exited before startup")
                time.sleep(0.02)
            self.assertTrue(SERVER.existing_app_server(port))
            connection = HTTPConnection("127.0.0.1", port, timeout=2)
            try:
                connection.request("GET", "/")
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertIn(b"Orch", response.read())
            finally:
                connection.close()
            reopened = subprocess.run(command, capture_output=True, text=True, timeout=5)
            self.assertEqual(reopened.returncode, 0, reopened.stderr)
            self.assertIn(f"already running: http://127.0.0.1:{port}/", reopened.stdout)
            self.assertIsNone(process.poll())
        finally:
            process.send_signal(signal.SIGINT)
            process.communicate(timeout=5)
        self.assertEqual(process.returncode, 0)

    def test_public_pages_link_only_to_available_local_assets(self):
        class Links(HTMLParser):
            def __init__(self):
                super().__init__()
                self.paths = []
            def handle_starttag(self, tag, attrs):
                for key, value in attrs:
                    if key in ("href", "src") and value:
                        url = urlsplit(value)
                        if not url.scheme and not url.netloc and url.path:
                            self.paths.append(url.path)
        for page in ("index.html", "start.html"):
            links = Links()
            links.feed((SERVER.ROOT / page).read_text())
            for path in links.paths:
                with self.subTest(page=page, asset=path):
                    self.assertFalse(path.startswith("/"), "Project Pages needs relative links")
                    self.assertTrue((SERVER.ROOT / path).is_file())
                    self.assertIn(path, SERVER.ASSETS, "Must also work with the offline launcher")
        self.assertTrue((SERVER.ROOT / ".nojekyll").is_file())

    def test_foreign_server_is_not_reused(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--no-browser", "--port", str(server.server_port)],
                capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode, 1)
            self.assertIn("occupied by another program", result.stderr)
            self.assertNotIn("already running", result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=2)

    @patch.object(SERVER.sys, "platform", "darwin")
    def test_edge_fallback_when_chrome_is_unavailable(self):
        url = "http://127.0.0.1:8765/"
        with patch.object(SERVER.subprocess, "run", side_effect=[
            subprocess.CompletedProcess([], 1), subprocess.CompletedProcess([], 0)
        ]) as launch, patch.object(SERVER.webbrowser, "open") as fallback:
            SERVER.open_app_browser(url, prefer_chromium=True)
            self.assertEqual([call.args[0] for call in launch.call_args_list], [
                ["open", "-a", "Google Chrome", url],
                ["open", "-a", "Microsoft Edge", url]
            ])
            fallback.assert_not_called()

    @patch.object(SERVER.sys, "platform", "darwin")
    def test_browser_launch_errors_do_not_abort_server(self):
        with patch.object(SERVER.subprocess, "run", side_effect=OSError), \
                patch.object(SERVER.webbrowser, "open", side_effect=SERVER.webbrowser.Error), \
                patch("builtins.print") as output:
            SERVER.open_app_browser("http://127.0.0.1:8765/", prefer_chromium=True)
            output.assert_any_call("Open this address in your browser: http://127.0.0.1:8765/")


if __name__ == "__main__":
    unittest.main()
