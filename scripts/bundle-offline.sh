#!/bin/sh
# Assembles bundle/ for packaging offline play into the AppImage:
#   bundle/crawl/   crawl binary + dat/ docs/ settings/ webserver/ build.h, and lib/ with
#                   the ncurses libraries it links (not every distro ships libtinfo)
#   bundle/python/  self-contained Python (python-build-standalone) with the webtiles
#                   server's dependencies installed
# server/ is packaged straight from the repo.
#
#   scripts/bundle-offline.sh [CRAWL_SOURCE_DIR]
#
# CRAWL_SOURCE_DIR is crawl-ref/source of a finished `scripts/build-crawl.sh` build.
set -eu
cd "$(dirname "$0")/.."
SRC="${1:-build/crawl-0.34.1/crawl-ref/source}"
OUT=bundle

PY_RELEASE=20250708
PY_VERSION=3.12.11
PY_SHA256=50f2684ecd4dfdff732d091f0e3d383261a9d524a850784cd01a1c0839ece3e7
PY_TARBALL="cpython-${PY_VERSION}+${PY_RELEASE}-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz"
PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PY_RELEASE}/${PY_TARBALL}"

[ -x "$SRC/crawl" ] || { echo "No crawl build at $SRC (run scripts/build-crawl.sh)" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/crawl/lib" build/cache

echo "== crawl"
cp "$SRC/crawl" "$SRC/build.h" "$OUT/crawl/"
strip "$OUT/crawl/crawl"
cp -r "$SRC/dat" "$OUT/crawl/dat"
cp -r "$SRC/../docs" "$OUT/crawl/docs"
cp -r "$SRC/../settings" "$OUT/crawl/settings"
# The webserver, minus tests and caches.
mkdir -p "$OUT/crawl/webserver"
for f in webtiles static templates game_data config.py server.py requirements; do
    cp -r "$SRC/webserver/$f" "$OUT/crawl/webserver/"
done
find "$OUT/crawl" \( -name '__pycache__' -o -name '*_test.py' \) -prune -exec rm -rf {} +
for lib in libncursesw.so.6 libtinfo.so.6; do
    path=$(ldd "$SRC/crawl" | awk -v l="$lib" '$1 == l { print $3 }')
    if [ -n "$path" ]; then cp -L "$path" "$OUT/crawl/lib/"; fi
done

echo "== python"
if [ ! -f "build/cache/$PY_TARBALL" ]; then
    curl -fsSL -o "build/cache/$PY_TARBALL.part" "$PY_URL"
    mv "build/cache/$PY_TARBALL.part" "build/cache/$PY_TARBALL"
fi
echo "$PY_SHA256  build/cache/$PY_TARBALL" | sha256sum -c -
tar -xzf "build/cache/$PY_TARBALL" -C "$OUT"   # extracts to $OUT/python
"$OUT/python/bin/python3" -m pip install --quiet --no-cache-dir --disable-pip-version-check \
    -r "$OUT/crawl/webserver/requirements/base.py3.txt"
# Trim what a headless server never uses.
PYLIB="$OUT/python/lib/python${PY_VERSION%.*}"
rm -rf "$PYLIB/test" "$PYLIB/idlelib" "$PYLIB/tkinter" "$PYLIB/turtledemo" "$PYLIB/ensurepip" \
    "$PYLIB/lib2to3" "$PYLIB/pydoc_data" "$PYLIB/lib-dynload/_tkinter"* \
    "$PYLIB/site-packages/pip" "$PYLIB/site-packages/pip-"* \
    "$OUT/python/lib/libtcl"* "$OUT/python/lib/libtk"* "$OUT/python/lib/tcl"* "$OUT/python/lib/tk"* \
    "$OUT/python/lib/Tix"* "$OUT/python/lib/itcl"* "$OUT/python/lib/thread"* \
    "$OUT/python/share" "$OUT/python/include" "$OUT/python/lib/pkgconfig" \
    "$OUT/python/lib/libpython3"*   # the interpreter is statically linked
find "$OUT/python/bin" ! -type d ! -name 'python3' ! -name "python${PY_VERSION%.*}" -delete
# The AppImage is read-only, so precompile now rather than at every start.
"$OUT/python/bin/python3" -m compileall -q -j0 "$OUT/python/lib" "$OUT/crawl/webserver" > /dev/null || true
"$OUT/python/bin/python3" -c "import tornado, yaml; print('python ok, tornado', tornado.version)"

du -sh "$OUT/crawl" "$OUT/python"
