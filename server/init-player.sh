#!/bin/sh
# Called by the webtiles server when the local player logs in. Creates the player's
# folders and, on first run, their rc file from the controller-friendly default.
set -e
NAME="$1"
DATA="${DCSS_DECK_DATA:?}"
mkdir -p "$DATA/rcs/running" "$DATA/ttyrecs/$NAME" "$DATA/morgue/$NAME"
if [ ! -f "$DATA/rcs/$NAME.rc" ]; then
    cp "${DCSS_DECK_DEFAULT_RC:?}" "$DATA/rcs/$NAME.rc"
fi
