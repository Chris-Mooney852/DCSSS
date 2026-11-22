#!/bin/sh
# Development setup for offline play: builds DCSS into build/ and creates build/venv with
# the webtiles server's Python dependencies. Packaged builds bundle these instead.
set -eu
TAG="${1:-0.34.1}"
cd "$(dirname "$0")/.."
scripts/build-crawl.sh "$TAG" "build/crawl-$TAG"
python3 -m venv build/venv
build/venv/bin/pip install -q -r "build/crawl-$TAG/crawl-ref/source/webserver/requirements/base.py3.txt"
echo "Offline play ready. Run: npm start"
