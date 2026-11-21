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
  const timer = setInterval(() => {
    const req = window.require;
    if (typeof req === "function" && req.defined && req.defined("comm")) {
      clearInterval(timer);
      patch(req("comm"));
    }
  }, 200);
})();`;
