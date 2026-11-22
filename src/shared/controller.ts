// Pure controller state machine: gamepad snapshot + game context in, keystrokes out.
// No DOM or Electron access here so it can be unit tested.

import {
  AIM_CONTEXTS, ARROW_STICK_CONTEXTS, Btn, CURSOR_CONTEXTS, LAYERS,
  RADIAL_HOLD_MS, REPEAT_DELAY_MS, REPEAT_INTERVAL_MS,
  type Binding, type ButtonName, type KeyStroke, type Layer,
} from "./bindings";
import type { InputContext } from "./context";
import type { RadialKind } from "./radial";
import { aim, VI_KEYS, type AimConfig, DEFAULT_AIM, type Direction } from "./stick";

export interface PadSnapshot {
  buttons: readonly boolean[];
  /** [leftX, leftY, rightX, rightY] */
  axes: readonly number[];
}

export type Action =
  | { type: "key"; stroke: KeyStroke }
  | { type: "launcher" }
  /** A radial button was held: show that radial. */
  | { type: "radial-open"; kind: RadialKind }
  /** The stick moved while a radial is open (null = centred). */
  | { type: "radial-point"; dir: Direction | null }
  | { type: "radial-page"; delta: 1 | -1 }
  /** Use the entry under the stick (if any) and close. */
  | { type: "radial-confirm" }
  | { type: "radial-cancel" };

export interface FrameResult {
  actions: Action[];
  /** Direction currently aimed with the left stick (map mode), for the overlay. */
  aimed: Direction | null;
  /** True while LT (the alt layer) is held in map mode. */
  altLayer: boolean;
}

const BUTTON_NAMES = Object.keys(Btn) as ButtonName[];

/** Radial slots are big targets: a lower deadzone than map aiming. */
const RADIAL_AIM: AimConfig = { ...DEFAULT_AIM, deadzone: 0.4, releaseZone: 0.3 };
/** How recently the stick may have left a slot for a release to still pick it. */
const RELEASE_GRACE_MS = 150;

const STICK_ARROWS: Record<Direction, string> = {
  N: "Up", NE: "Up", NW: "Up", S: "Down", SE: "Down", SW: "Down", E: "Right", W: "Left",
};

export class Controller {
  private prevButtons: boolean[] = [];
  private aimed: Direction | null = null;
  private context: InputContext | null = null;
  /** Repeat timers keyed by source id; value is the time the next repeat fires. */
  private repeats = new Map<string, number>();
  /** Buttons used by a combo; ignored until released. */
  private consumed = new Set<number>();
  /** Radial buttons currently held, and since when (not yet a tap or a radial). */
  private holdStart = new Map<number, number>();
  /** The open radial and the button that opened it. */
  private radial: { button: number } | null = null;
  private radialAim: Direction | null = null;
  /** Last slot pointed at and when the stick left it (for release grace). */
  private radialLast: { dir: Direction; leftAt: number } | null = null;

  /** True while a radial is open. */
  get radialOpen(): boolean {
    return this.radial !== null;
  }

  /** Called when a radial closes for reasons outside the controller (e.g. no entries). */
  closeRadial(): void {
    if (this.radial) this.consumed.add(this.radial.button);
    this.radial = null;
    this.radialAim = null;
    this.radialLast = null;
  }

  constructor(private readonly aimCfg: AimConfig = DEFAULT_AIM) {}

  frame(pad: PadSnapshot, context: InputContext, now: number): FrameResult {
    const actions: Action[] = [];
    const held = (b: number) => pad.buttons[b] === true;
    const pressed = (b: number) => held(b) && this.prevButtons[b] !== true;

    if (context !== this.context) {
      this.repeats.clear();
      this.context = context;
    }
    for (const b of [...this.consumed]) if (!held(b)) this.consumed.delete(b);

    // Back + Start: return to the server picker, from anywhere.
    if (held(Btn.Back) && held(Btn.Start) && (pressed(Btn.Back) || pressed(Btn.Start))) {
      actions.push({ type: "launcher" });
      this.consumed.add(Btn.Back).add(Btn.Start);
      this.holdStart.delete(Btn.Back);
      this.holdStart.delete(Btn.Start);
      if (this.radial) {
        actions.push({ type: "radial-cancel" });
        this.closeRadial();
      }
    }

    if (this.radial) {
      this.radialFrame(pad, held, pressed, now, actions);
      this.prevButtons = [...pad.buttons];
      return { actions, aimed: null, altLayer: false };
    }

    const prevAim = this.aimed;
    this.aimed = aim(pad.axes[0] ?? 0, pad.axes[1] ?? 0, this.aimed, this.aimCfg);

    const layers = LAYERS[context];
    const altLayer = context === "map" && held(Btn.LT);
    const layer: Layer = altLayer && layers.alt ? layers.alt : layers.base;

    // Left stick.
    if (AIM_CONTEXTS.has(context)) {
      // Caves of Qud style: aim with the stick, A commits the step, RT makes it a run.
      if (!altLayer) {
        const moveKey = (): KeyStroke | null => {
          if (!this.aimed) return null;
          const key = VI_KEYS[this.aimed];
          return held(Btn.RT) ? { key: key.toUpperCase(), shift: true } : { key };
        };
        this.handleRepeat("move", held(Btn.A) && this.aimed !== null, pressed(Btn.A), now, actions, moveKey);
      }
    } else if (CURSOR_CONTEXTS.has(context)) {
      const changed = this.aimed !== null && this.aimed !== prevAim;
      if (changed) this.repeats.delete("cursor");
      this.handleRepeat("cursor", this.aimed !== null, changed, now, actions,
        () => (this.aimed ? { key: VI_KEYS[this.aimed] } : null));
    } else if (ARROW_STICK_CONTEXTS.has(context)) {
      const changed = this.aimed !== null && this.aimed !== prevAim;
      if (changed) this.repeats.delete("stick");
      this.handleRepeat("stick", this.aimed !== null, changed, now, actions,
        () => (this.aimed ? { key: STICK_ARROWS[this.aimed] } : null));
    }

    // Buttons.
    for (const name of BUTTON_NAMES) {
      const b = Btn[name];
      if (this.consumed.has(b)) continue;
      // In map mode A is the move-confirm button unless the alt layer is active.
      if (name === "A" && AIM_CONTEXTS.has(context) && !altLayer) continue;
      const binding: Binding | undefined = layer[name];
      if (!binding) {
        this.holdStart.delete(b);
        continue;
      }
      if (binding.radial) {
        // Tap = the normal key (sent on release); hold = open the radial.
        if (pressed(b)) {
          this.holdStart.set(b, now);
        } else if (held(b) && this.holdStart.has(b) && now - this.holdStart.get(b)! >= RADIAL_HOLD_MS) {
          this.holdStart.delete(b);
          this.radial = { button: b };
          this.radialAim = null;
          actions.push({ type: "radial-open", kind: binding.radial });
          break;
        } else if (!held(b) && this.holdStart.has(b)) {
          this.holdStart.delete(b);
          actions.push({ type: "key", stroke: binding.stroke });
        }
      } else if (binding.repeat) {
        this.handleRepeat(`btn:${name}`, held(b), pressed(b), now, actions, () => binding.stroke);
      } else if (pressed(b)) {
        actions.push({ type: "key", stroke: binding.stroke });
      }
    }

    this.prevButtons = [...pad.buttons];
    return { actions, aimed: AIM_CONTEXTS.has(context) ? this.aimed : null, altLayer };
  }

  /** Input while a radial is open: the stick points, release (or A) uses, B cancels. */
  private radialFrame(
    pad: PadSnapshot, held: (b: number) => boolean, pressed: (b: number) => boolean,
    now: number, out: Action[],
  ): void {
    const dir = aim(pad.axes[0] ?? 0, pad.axes[1] ?? 0, this.radialAim, RADIAL_AIM);
    if (dir !== this.radialAim) {
      if (this.radialAim && !dir) this.radialLast = { dir: this.radialAim, leftAt: now };
      this.radialAim = dir;
      out.push({ type: "radial-point", dir });
    }
    if (pressed(Btn.Left)) out.push({ type: "radial-page", delta: -1 });
    if (pressed(Btn.Right)) out.push({ type: "radial-page", delta: 1 });

    const trigger = this.radial!.button;
    if (pressed(Btn.B)) {
      out.push({ type: "radial-cancel" });
      this.consumed.add(Btn.B);
      this.closeRadial();
    } else if (pressed(Btn.A) || !held(trigger)) {
      // Players often let go of the stick and the button together: if the stick only just
      // left a slot, use that slot.
      if (!this.radialAim && this.radialLast && now - this.radialLast.leftAt <= RELEASE_GRACE_MS) {
        out.push({ type: "radial-point", dir: this.radialLast.dir });
      }
      out.push({ type: "radial-confirm" });
      if (held(Btn.A)) this.consumed.add(Btn.A);
      this.closeRadial();
    }
  }

  /** Emit on the initial press, then repeat while held. */
  private handleRepeat(
    id: string, isHeld: boolean, justPressed: boolean, now: number,
    out: Action[], stroke: () => KeyStroke | null,
  ): void {
    if (!isHeld) {
      this.repeats.delete(id);
      return;
    }
    const next = this.repeats.get(id);
    if (justPressed || next === undefined) {
      if (!justPressed) return; // held since before this context; wait for a fresh press
      const s = stroke();
      if (s) out.push({ type: "key", stroke: s });
      this.repeats.set(id, now + REPEAT_DELAY_MS);
    } else if (now >= next) {
      const s = stroke();
      if (s) out.push({ type: "key", stroke: s });
      this.repeats.set(id, now + REPEAT_INTERVAL_MS);
    }
  }
}
