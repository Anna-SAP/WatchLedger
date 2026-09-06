"""Local-only media ledger. Python 3.10+, standard library only."""
import argparse
from contextlib import contextmanager
import datetime as dt
import json
import os
from pathlib import Path
import secrets
import sqlite3
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent

@contextmanager
def connect(path):
    db = sqlite3.connect(path, timeout=20)
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, start REAL, end REAL, payload TEXT NOT NULL)')
    db.execute('CREATE INDEX IF NOT EXISTS event_time ON events(end)')
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def validate(e):
    if not isinstance(e, dict):
        raise ValueError('event must be an object')
    for key in ('id', 'session', 'url', 'title', 'platform', 'browser', 'channel', 'kind', 'identitySource', 'adStatus'):
        if not isinstance(e.get(key), str) or len(e[key]) > 4096:
            raise ValueError('invalid ' + key)
    if urlsplit(e['url']).scheme not in ('http', 'https'):
        raise ValueError('invalid URL')
    import math
    for key in ('start', 'end', 'from', 'to', 'rate', 'duration'):
        if isinstance(e.get(key), bool) or not isinstance(e.get(key), (int, float)) or not math.isfinite(e[key]):
            raise ValueError('invalid ' + key)
    if not (0 < e['end'] - e['start'] <= 20_000 and 0 <= e['from'] < e['to'] and 0 < e['rate'] <= 16):
        raise ValueError('invalid interval')
    if e['to'] - e['from'] > (e['end'] - e['start']) / 1000 * e['rate'] + 2:
        raise ValueError('seek-like interval')
    if e['duration'] < 0 or e['end'] > time.time()*1000 + 300_000:
        raise ValueError('invalid time')
    for key in ('hidden', 'muted'):
        if not isinstance(e.get(key), bool):
            raise ValueError('invalid ' + key)
    return e

def union_seconds(intervals):
    total, last = 0, None
    for a, b in sorted(intervals):
        if last is None or a > last:
            total += b-a
        elif b > last:
            total += b-last
        last = max(last or b, b)
    return total

class App:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / 'ledger.sqlite3'
        tokenfile = self.directory / 'pairing-token.txt'
        if not tokenfile.exists():
            tokenfile.write_text(secrets.token_urlsafe(32), encoding='utf-8')
        self.token = tokenfile.read_text(encoding='utf-8').strip()
        with connect(self.path):
            pass

    def insert(self, events):
        if not isinstance(events, list) or len(events) > 500:
            raise ValueError('batch limit')
        validated = [validate(e) for e in events]
        with connect(self.path) as db:
            db.executemany('INSERT OR IGNORE INTO events VALUES (?,?,?,?)',
                [(e['id'], e['start'], e['end'], json.dumps(e, ensure_ascii=False)) for e in validated])
        return len(validated)

    def events(self):
        with connect(self.path) as db:
            return [json.loads(r[0]) for r in db.execute('SELECT payload FROM events ORDER BY start DESC')]

def make_handler(app, port):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            # Do not write titles, URLs, credentials, or viewing history to logs.
            pass

        def origin_ok(self):
            origin = self.headers.get('Origin', '')
            return not origin or origin == f'http://127.0.0.1:{port}' or origin.startswith(('chrome-extension://', 'moz-extension://'))

        def reply(self, status, value, mime='application/json; charset=utf-8'):
            data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; object-src 'none'")
            origin = self.headers.get('Origin', '')
            if origin and self.origin_ok():
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
                self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.end_headers()
            self.wfile.write(data)

        def authorized(self):
            return (self.headers.get('Host') == f'127.0.0.1:{port}' and self.origin_ok()
                and secrets.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + app.token))

        def do_OPTIONS(self):
            self.reply(204 if self.origin_ok() else 403, b'')

        def do_GET(self):
            path = urlsplit(self.path).path
            static = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript'),
                '/style.css': ('style.css', 'text/css'), '/fixture.html': ('fixture.html', 'text/html; charset=utf-8'),
                '/fixture.js': ('fixture.js', 'text/javascript')}
            if self.headers.get('Host') != f'127.0.0.1:{port}':
                return self.reply(403, {'error': 'invalid host'})
            if path in static:
                name, mime = static[path]
                return self.reply(200, (ROOT / 'web' / name).read_bytes(), mime)
            if not self.authorized():
                return self.reply(401, {'error': '需要本地配对码'})
            if path == '/api/events':
                return self.reply(200, app.events())
            if path == '/api/status':
                with connect(app.path) as db:
                    count = db.execute('SELECT COUNT(*) FROM events').fetchone()[0]
                return self.reply(200, {'ok': True, 'segments': count, 'dataPath': str(app.path)})
            self.reply(404, {'error': 'not found'})

        def do_POST(self):
            if not self.authorized():
                return self.reply(401, {'error': 'unauthorized'})
            try:
                n = int(self.headers.get('Content-Length', '0'))
                if not 0 < n <= 4_000_000:
                    raise ValueError('body limit')
                data = json.loads(self.rfile.read(n))
                if self.path == '/api/events':
                    return self.reply(200, {'accepted': app.insert(data)})
                if self.path == '/api/delete' and data == {'confirm': 'DELETE ALL'}:
                    with connect(app.path) as db:
                        db.execute('DELETE FROM events')
                    return self.reply(200, {'ok': True})
                self.reply(404, {'error': 'not found'})
            except (ValueError, TypeError, KeyError) as exc:
                self.reply(400, {'error': str(exc)})
            except sqlite3.Error:
                self.reply(503, {'error': 'database unavailable; retry later'})
    return Handler

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=17643)
    parser.add_argument('--data-dir', default=str(Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'WatchLedger'))
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    app = App(args.data_dir)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(app, args.port))
    print(f'WatchLedger listening on http://127.0.0.1:{args.port}; database: {app.path}', flush=True)
    if not args.no_browser:
        webbrowser.open(f'http://127.0.0.1:{args.port}/#' + app.token)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
