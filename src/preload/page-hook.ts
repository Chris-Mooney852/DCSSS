// Source for a script injected into the page's *main world* (the preload itself runs in an
// isolated world and cannot see the page's JS). It wraps the webtiles `comm` module's
// message dispatch and forwards the messages we care about via window.postMessage.
//
// It is kept as a string so it can be passed to webFrame.executeJavaScript, which also
// bypasses the page's CSP.

export const HOOK_TAG = "__dcssDeck";

export const FORWARDED_MESSAGES = [
  "game_started", "game_ended", "go_lobby",
  "input_mode", "init_input", "close_input",
  "ui-push", "ui-pop", "menu", "close_menu",
];

export const PAGE_HOOK_SOURCE = `(() => {
  if (window.${HOOK_TAG}Hooked) return;
  window.${HOOK_TAG}Hooked = true;
  // The client asks "leave this page?" while a game runs. Leaving is safe (the server
  // saves when the connection closes) and the prompt would block returning to the
  // launcher, so never let the page register it.
  const addListener = window.addEventListener;
  window.addEventListener = function (type, ...rest) {
    if (type === "beforeunload") return;
    return addListener.call(this, type, ...rest);
  };
  Object.defineProperty(window, "onbeforeunload", { set() {}, get() { return null; } });
  const wanted = new Set(${JSON.stringify(FORWARDED_MESSAGES)});
  const forward = (m) => {
    if (m && typeof m === "object" && wanted.has(m.msg)) {
      try { window.postMessage({ ${HOOK_TAG}: true, message: JSON.parse(JSON.stringify(m)) }, "*"); } catch (e) {}
    }
  };
  const patch = (comm) => {
    if (!comm || comm.${HOOK_TAG}Patched) return;
    comm.${HOOK_TAG}Patched = true;
    const handle = comm.handle_message;
    comm.handle_message = function (m) { forward(m); return handle.apply(this, arguments); };
    const immediate = comm.handle_message_immediately;
    comm.handle_message_immediately = function (m) {
      const handled = immediate.apply(this, arguments);
      if (handled) forward(m);
      return handled;
    };
  };
  // Game modules are loaded per version, e.g. "game-<hash>/player".
  const gameModule = (name) => {
    const req = window.require;
    const defined = req && req.s && req.s.contexts && req.s.contexts._ && req.s.contexts._.defined;
    if (!defined) return null;
    const id = Object.keys(defined).find((k) => k.endsWith("/" + name));
    return id ? defined[id] : null;
  };
  window.${HOOK_TAG}Module = gameModule;

  // Requests from the app's preload (radial menus).
  window.addEventListener("message", (e) => {
    const req = e.source === window && e.data && e.data.${HOOK_TAG}Request;
    if (!req) return;
    const reply = (data) => window.postMessage({ ${HOOK_TAG}: true, reply: req.type, id: req.id, data }, "*");
    try {
      if (req.type === "inventory") {
        const player = gameModule("player");
        const inv = player && player.inv ? Object.values(player.inv) : [];
        reply(JSON.parse(JSON.stringify(inv)));
      } else if (req.type === "item-action" && typeof req.slot === "number") {
        // Same as clicking an item in the client's consumables panel.
        window.require("comm").send_message("inv_item_action", { slot: req.slot });
        reply(true);
      }
    } catch (err) {
      reply(null);
    }
  });
  let lastMode;
  setInterval(() => {
    const req = window.require;
    if (typeof req === "function" && req.defined && req.defined("comm")) patch(req("comm"));
    // Also report the current input mode directly, in case its message arrived before
    // the hook was attached (the app waits for it before accepting commands).
    const game = gameModule("game");
    const mode = game && typeof game.get_input_mode === "function" ? game.get_input_mode() : undefined;
    if (typeof mode === "number" && mode !== lastMode) {
      lastMode = mode;
      forward({ msg: "input_mode", mode });
    }
  }, 200);
})();`;
