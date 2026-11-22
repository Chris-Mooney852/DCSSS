#!/bin/sh
# Builds the DCSS webtiles binary that offline play uses.
#
#   scripts/build-crawl.sh [VERSION_TAG] [OUT_DIR]
#
# Produces OUT_DIR/crawl-ref/source with the `crawl` binary, `dat/` and `webserver/`.
# Needs: build-essential (g++, make), bison, flex, pkg-config, libncursesw-dev, python3
# with pyyaml (the build generates some files with it), git.
# sqlite, lua, zlib, libpng and pcre are built from DCSS's bundled copies, so the
# binary only links ncurses, libstdc++ and libc dynamically.
set -eu
TAG="${1:-0.34.1}"
OUT="${2:-build/crawl-$TAG}"

if [ ! -d "$OUT/.git" ]; then
    git clone --depth 1 --branch "$TAG" https://github.com/crawl/crawl.git "$OUT"
fi
cd "$OUT"
for m in sqlite lua zlib libpng pcre; do
    git submodule update --init --depth 1 "crawl-ref/source/contrib/$m"
done
cd crawl-ref/source
make -j"$(nproc)" WEBTILES=y BUILD_ALL=y
echo "Built $(pwd)/crawl"
