"""Opt-in local mock server. Not imported by or included in the Expo app/site."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preview', action='store_true', help='Explicitly enable the developer mock')
parser.add_argument('--port', type=int, default=8765)
args = parser.parse_args()
if not args.preview:
    parser.error('Developer-only mock: pass --preview to enable')

page = Path(__file__).with_name('index.html').read_bytes()

class Preview(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/dev/plan-picker':
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(page)

server = HTTPServer(('127.0.0.1', args.port), Preview)
print(f'Developer mock: http://127.0.0.1:{args.port}/dev/plan-picker', flush=True)
server.serve_forever()
