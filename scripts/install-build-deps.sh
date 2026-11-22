#!/bin/sh
# Installs what scripts/build-crawl.sh needs on Ubuntu/Debian. Used by CI, which builds in
# an ubuntu:22.04 container so the binary runs on any glibc >= 2.35 (all current SteamOS).
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q --no-install-recommends \
    build-essential bison flex pkg-config libncursesw5-dev \
    python3 python3-yaml git ca-certificates curl xz-utils binutils
