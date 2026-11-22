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

### 5. Packaging (CI)
- Build crawl in an old-glibc container (Steam Runtime "sniper" or Ubuntu 22.04), cached
  per tag.
- Bundle python-build-standalone with tornado, pyyaml and crypt-r installed.
- Ship as electron-builder `extraResources`: `crawl/` (binary, `dat/`, `webserver/`),
  `python/`, `server/`.
- Expected AppImage size: about 250 MB.
- GPL: the About screen and README link the exact upstream tag as the source.

### 6. End-to-end tests
- Make the spike's script (`/tmp`-only for now) into a proper test with Playwright's Electron
  support, run against the bundled server.
- Add a fake gamepad, so tests drive the real controller code, not raw keys.
- Run it in CI.

## Risks
- **Upstream bit-rot:** the webtiles client or protocol can change between versions. The
  end-to-end tests are the safety net.
- **Battery:** Python, crawl and Electron all run on the Deck. crawl and the server are idle
  between turns, so this should be minor, but measure it on the device.
- **Size:** about 250 MB is fine for a Deck, but keep an eye on it.
