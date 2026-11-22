# DCSS Deck

A controller-first client for [Dungeon Crawl Stone Soup](https://github.com/crawl/crawl)
webtiles, built for the Steam Deck.

- Plays offline on the device, or online on the public webtiles servers.
- Caves of Qud-style movement: aim with the left stick, press A to step.
- Radial menus for items, spells, abilities and common commands.
- Controls change with what's on screen (exploring, targeting, menus, prompts, text
  entry), based on the game's own webtiles protocol messages.
- Steam Input works fully: remap buttons, back paddles and gyro in Steam's layout editor.

> **Known issue:** offline play currently fails to start on the Steam Deck
> ([#1](https://github.com/Chris-Mooney852/DCSSS/issues/1)). Online play works.

This is an unofficial fan project and is not affiliated with the DCSS dev team.
See [docs/CONTROLS.md](docs/CONTROLS.md) for the default layout.

## How it works

```
Steam Input ──► virtual Xbox pad ──► Gamepad API (preload) ──► controller state machine
                                                                     │ keystrokes
 webtiles page ◄── trusted key events (webContents.sendInputEvent) ◄─┘ (main process)
      │ protocol messages (input_mode, menus, prompts...)
      └──► page hook ──► context tracker ──► controller state machine
```

| Path | What it does |
|---|---|
| `src/main/main.ts` | Electron main process: window, launcher, sends key events into the page |
| `src/main/local-server.ts` | Starts and supervises the offline DCSS server |
| `server/` | Wrapper that runs the upstream webtiles server as a private local server |
| `src/preload/preload.ts` | Polls the gamepad, works out the context, draws the overlay |
| `src/preload/page-hook.ts` | Injected into the page; forwards webtiles `comm` messages |
| `src/shared/stick.ts` | 8-way stick aiming with deadzone and hysteresis |
| `src/shared/context.ts` | Works out the current screen from protocol messages |
| `src/shared/bindings.ts` | Default button layout per screen |
| `src/shared/controller.ts` | Pure state machine: pad snapshot + context → keystrokes |
| `src/launcher/` | Server picker page |

## Development

Needs Node 22. Any Xbox-style controller works for testing on a PC.

```sh
npm install
npm run setup:offline   # optional: build DCSS 0.34.1 for offline play (~3 min)
npm start          # build and run
npm test           # unit tests
npm run test:e2e   # end-to-end: real app + offline DCSS, simulated gamepad (needs a display)
npm run typecheck
```

Building the AppImage needs the offline bundle. CI builds it in an `ubuntu:22.04` container,
so the binary runs on any current SteamOS. To do the same locally:

```sh
docker run --rm -v "$PWD":/repo -w /repo ubuntu:22.04 sh -c \
  'scripts/install-build-deps.sh && scripts/build-crawl.sh && scripts/bundle-offline.sh'
npm run dist       # release/DCSS-Deck-<version>-x86_64.AppImage (~180 MB)
```

## Installing on a Steam Deck

No Steamworks account is needed.

1. In **Desktop Mode**, download the AppImage. CI uploads one for every push, under
   the **Actions** tab (you need to be signed in to GitHub to download it). Extract
   the zip, then right-click the AppImage → Properties → Permissions → mark it executable.
2. In Steam: **Games → Add a Non-Steam Game to My Library**, and pick the AppImage.
3. **Set the launch option.** In Steam, open the game's **Properties → General → Launch
   Options** and enter:
   ```
   GTK_IM_MODULE=simple %command%
   ```
   Without it, every letter typed with the Steam on-screen keyboard appears twice in
   Game Mode. This affects Electron AppImages generally; see
   [Heroic #4250](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/issues/4250).
4. Back in **Game Mode**, launch it from your library. It runs fullscreen on the Deck.
   Saves live in `~/.local/share/dcss-deck/`.
   **Play offline** is currently broken on the Deck
   ([#1](https://github.com/Chris-Mooney852/DCSSS/issues/1)); online play works.
5. In the game's controller settings (Steam button → Controller settings), make sure a
   **Gamepad** template is selected; a keyboard/mouse layout hides the controller from
   the app. Then remap anything you like.

To iterate faster, enable SSH on the Deck (`passwd`, then `sudo systemctl enable --now sshd`)
and `scp` new builds across.

## Roadmap

- [x] Electron shell, server picker, gamepad → key events
- [x] Caves of Qud-style movement, direction compass and button hints
- [x] Controls that change per screen (map / targeting / menus / prompts / text)
- [ ] Highlight the aimed tile on the map itself, not just the compass
- [x] Radial menus: hold LB (items), RB (spells), View (abilities), Menu (commands)
- [ ] Item and spell tiles (icons) in the radial menus
- [x] Offline play: DCSS 0.34.1 and its webtiles server bundled, running on localhost
      ([docs/PLAN-offline.md](docs/PLAN-offline.md))
- [x] End-to-end tests against the real game with a simulated gamepad, in CI
- [ ] Build in the Steam Runtime container instead of Ubuntu 22.04 (optional)
- [ ] In-app settings (deadzone, repeat speed, hints on/off)

## License

GPL-2.0-or-later, matching DCSS.
