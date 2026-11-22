#!/bin/sh
# Installs what the end-to-end tests need on Ubuntu/Debian: a virtual display (xvfb)
# and the shared libraries Electron loads.
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q --no-install-recommends \
    xvfb xauth procps libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgtk-3-0 \
    libgbm1 libasound2 libxss1 libxtst6 libxshmfence1 libxkbcommon0 fonts-dejavu-core
