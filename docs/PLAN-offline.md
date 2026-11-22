# Plan: offline play

Bundle DCSS and its webtiles server in the app, so the Deck can play with no internet.
This also gives development and CI a real game to test against.

Decisions: offline play first; bundle DCSS **0.34.1** only (trunk can come later); one local
player profile (save slots still allow several characters).

## How it works

```
Electron main ──spawns──► deck_server.py (bundled Python)
                              │ generates config with writable paths, registers the
                              │ local player, then runs the upstream webtiles server
                              ▼
                    127.0.0.1:<random port>  ──spawns──► crawl (WEBTILES=y build)
                              ▲
Electron window ── loads http://127.0.0.1:<port>/#play-dcss-deck
```

- The upstream server runs unmodified in its normal multi-game ("dgl") mode with `autologin`.
  The `#play-dcss-deck` link skips the lobby.
- All writable state lives in `~/.local/share/dcss-deck/`: saves, rc files, morgues,
  the user database and the generated config. The AppImage's own files are read-only.
- Sockets between the server and crawl live in `$XDG_RUNTIME_DIR/dcss-deck/`, because Unix
  socket paths are limited to about 107 bytes.
- The player's rc file is created from `server/deck-default.rc` on first run, then left
  alone.

## Steps

### 1. Spike ✅ done

| Question | Result |
|---|---|
| Does 0.34.1 build with `WEBTILES=y`? | Yes, about 3 min on 4 cores (`scripts/build-crawl.sh`). The 21 MB binary links only ncurses, libstdc++ and libc. Game data is about 43 MB. |
| Server dependencies? | Python 3 with tornado 6.4.2, pyyaml and crypt-r (crypt-r only on Python 3.13+). |
| Can we skip accounts? | Yes. `autologin`, plus registering the user at startup with a random password nobody types (`server/deck_server.py`). |
| Does the `#play-<id>` jump work? | Yes, straight into character creation or the saved game. |
| Do the app's hook and screen detection work on the real client? | Yes. An end-to-end run covered character creation (menus), the map, inventory, look (targeting), running, a prompt, and save and quit back to the lobby. |

Problems found and fixed during the spike:
- Long socket paths crash crawl (`buffer overflow detected`). Sockets now live under
  `XDG_RUNTIME_DIR`, with a length check.
- `game_started` can arrive before the page hook attaches, so "are we in a game?" now comes
  from which layer the page shows (`#lobby` / `#loader`), not from messages.

### 2. Local server manager ✅ done
- `src/main/local-server.ts` picks a free port and spawns `deck_server.py`. It waits for the
  `DCSS_DECK_READY` line and for the port to accept connections, then the app loads
  `http://127.0.0.1:<port>/#play-dcss-deck`.
- The server stops when the app quits. If it dies, the launcher shows an error box with the
  last 60 log lines, and Play offline acts as Retry.
- Logs go to `<data dir>/logs/server-*.log`; the newest 5 are kept.
- After save and quit or death (the `game_ended` message), the app returns to its launcher
  instead of the server's lobby.
- Fixed: the webtiles client's "leave this page?" handler silently blocked navigation back
  to the launcher, also from View + Menu. The app now ignores it; the server saves the game
  when the connection closes.
- Paths are set in `src/main/paths.ts`, with `DCSS_DECK_*` environment overrides.
- Tests: `test/local-server.test.ts` covers startup, a startup crash, a timeout, a crash while
  running, a missing build and log rotation, using a fake server. An end-to-end run against
  the real game covered launcher → play → character creation → save and quit → launcher →
  resume → server killed → error screen → retry → quit with no processes left behind.

### 3. Controller-friendly defaults (`server/deck-default.rc`)
- Started: `easy_confirm = all`.
- Still to review: travel and explore delays, `more`-prompt behaviour, and tile and font
  sizes for the Deck's 7" 1280×800 screen.

### 4. Launcher
- Make **Play offline** the first, default entry. Online servers go below it.
- Show the build's version.

### 5. Packaging ✅ done (pending the first CI run)
- `scripts/build-crawl.sh` builds DCSS in an `ubuntu:22.04` container, so the newest glibc
  symbol it needs is 2.34. The Steam Runtime image would be nicer, but its registry is
  unreachable from the dev sandbox; revisit if needed.
- `scripts/bundle-offline.sh` assembles `bundle/`:
  - `crawl/` (74 MB): the stripped binary, `dat/`, `docs/`, `settings/` and the webserver,
    plus `lib/` with the ncurses libraries it links. `deck_server.py` points crawl at them
    with `LD_LIBRARY_PATH`, since not every distro ships `libtinfo`.
  - `python/` (60 MB): python-build-standalone 3.12.11 (pre-stripped, pinned by SHA-256)
    with tornado and pyyaml. Unused parts (Tk, tests, pip, headers, the shared libpython)
    are removed, and everything is precompiled, because the AppImage is read-only.
- `electron-builder.yml` copies `bundle/crawl`, `bundle/python` and `server/` into
  `resources/`. `npm run dist` refuses to build without the bundle.
- The AppImage is **179 MB**.
- CI (`.github/workflows/build.yml`) runs everything in `ubuntu:22.04` and caches the DCSS
  build and the Python download.
- Tested here: the AppImage, run with no path overrides, starts the bundled server and goes
  through launcher → Play offline → character creation → in game → the help screen (which
  reads the bundled docs). The full save/quit/crash/retry run also passed against `bundle/`.

### 6. End-to-end tests ✅ done
- `e2e/` uses Playwright's Electron support to launch the real app. Each test gets a fresh
  profile and data dir, and the bundled server (or the dev build).
- A **simulated gamepad** (`e2e/harness.ts`) feeds pad states through the
  `dcss:simulated-pad` IPC channel. The app's real controller code turns them into keys.
  Only the main process can send on that channel; web pages can't reach it.
- Checks go through the game itself, e.g. the in-game turn counter (`#stats_time`)
  proves that stick + A took a step and that aiming alone did not.
- Coverage:
  - character creation with the stick and A;
  - Qud-style movement;
  - R3 wait;
  - LB inventory and B back;
  - View look mode with the stick moving the cursor;
  - the LT layer (LT + Menu = save and quit) back to the launcher, then resuming the same
    game;
  - View + Menu from a running game;
  - a server crash: error box, then Retry.
- Runs in CI under `xvfb-run` in the `ubuntu:22.04` container, before the AppImage is
  built. The whole pipeline was verified in that image locally; 3 tests, about 40 s, stable
  across repeated runs.
- Also fixed: the page hook now stops the client from registering its "leave this page?"
  handler at all, on top of the main process ignoring it.

## Risks
- **Upstream bit-rot:** the webtiles client or protocol can change between versions. The
  end-to-end tests are the safety net.
- **Battery:** Python, crawl and Electron all run on the Deck. crawl and the server are idle
  between turns, so this should be minor, but measure it on the device.
- **Size:** about 250 MB is fine for a Deck, but keep an eye on it.
