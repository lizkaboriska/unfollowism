#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from datetime import datetime
import json
import os
import re
import shutil
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent
MASTER = ROOT / "instagram_master_tracker.json"
CONNECTIONS = ROOT / "connections"
ARCHIVE = ROOT / "archive"
HOST = "127.0.0.1"
PORT = int(os.environ.get("INSTAGRAM_TRACKER_PORT", "8000"))
SCHEMA_VERSION = 6


def local_now_iso():
    return datetime.now().astimezone().isoformat()


def backup_master():
    if not MASTER.exists():
        return None
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().astimezone().strftime("%Y-%m-%d_%H-%M-%S_%f")
    backup = ARCHIVE / f"instagram_master_tracker_{stamp}.json"
    shutil.copy2(MASTER, backup)
    return backup


def follower_file_sort_key(path):
    match = re.fullmatch(r"followers_(\d+)\.json", path.name)
    return int(match.group(1)) if match else float("inf")


def discover_follower_files():
    return sorted(
        (path for path in CONNECTIONS.glob("followers_*.json") if path.is_file()),
        key=follower_file_sort_key,
    )


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/connection-files":
            followers = discover_follower_files()
            self.send_json(200, {
                "following": "following.json" if (CONNECTIONS / "following.json").is_file() else None,
                "followers": [path.name for path in followers],
            })
            return

        super().do_GET()

    def do_POST(self):
        if self.path != "/api/save-master":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 50 * 1024 * 1024:
                raise ValueError("Invalid request size")

            raw = self.rfile.read(length)
            data = json.loads(raw)
            if not isinstance(data, dict) or not isinstance(data.get("accounts"), dict):
                raise ValueError("Master JSON does not look valid")
            if not isinstance(data.get("snapshots", []), list):
                raise ValueError("Master snapshots are invalid")
            if not isinstance(data.get("actions", []), list):
                raise ValueError("Master actions are invalid")

            saved_at = local_now_iso()
            data["schema_version"] = SCHEMA_VERSION
            data["last_saved_at"] = saved_at
            data["last_updated_at"] = saved_at

            backup = backup_master()

            temp = MASTER.with_suffix(".json.tmp")
            temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.replace(temp, MASTER)

            self.send_json(200, {
                "ok": True,
                "file": MASTER.name,
                "saved_at": saved_at,
                "backup": str(backup.relative_to(ROOT)) if backup else None,
            })
        except Exception as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})


if __name__ == "__main__":
    os.chdir(ROOT)
    url = f"http://{HOST}:{PORT}/"
    print(f"Instagram Tracker: {url}")
    print("Press Control-C in this window to stop the server.")
    if os.environ.get("INSTAGRAM_TRACKER_NO_BROWSER") != "1":
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
