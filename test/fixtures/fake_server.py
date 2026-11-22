"""Stands in for server/deck_server.py in tests. Behaviour is chosen with FAKE_MODE:
ok (ready, then serve), crash (fail before ready), slow (never ready),
die-later (ready, then exit)."""
import argparse, http.server, os, sys, time

p = argparse.ArgumentParser()
for a in ("--crawl-dir", "--data-dir", "--port", "--user"):
    p.add_argument(a)
args = p.parse_args()
mode = os.environ.get("FAKE_MODE", "ok")

print("starting fake server", flush=True)
if mode == "crash":
    print("Traceback: something broke", file=sys.stderr, flush=True)
    sys.exit(3)
if mode == "slow":
    time.sleep(60)
print(f"DCSS_DECK_READY game=dcss-deck port={args.port} version=9.9", flush=True)
srv = http.server.HTTPServer(("127.0.0.1", int(args.port)), http.server.SimpleHTTPRequestHandler)
if mode == "die-later":
    srv.timeout = 0.3
    srv.handle_request()
    print("fatal: crawl went away", flush=True)
    sys.exit(1)
srv.serve_forever()
