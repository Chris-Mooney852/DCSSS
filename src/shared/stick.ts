// Converts an analog stick position into one of 8 compass directions,
// Caves of Qud style: the stick only *aims*, a button press commits the move.

export type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

/** Directions in clockwise order starting at East (angle 0, screen coordinates). */
const SECTORS: readonly Direction[] = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
const SECTOR_SIZE = Math.PI / 4;

export interface AimConfig {
  /** Stick magnitude (0..1) the stick must exceed to start aiming. */
  deadzone: number;
  /** Magnitude below which an existing aim is released (lower than deadzone, avoids flicker). */
  releaseZone: number;
  /** Extra angle (radians) the stick must pass beyond a sector edge before the aim switches. */
  hysteresis: number;
}

export const DEFAULT_AIM: AimConfig = {
  deadzone: 0.5,
  releaseZone: 0.35,
  hysteresis: (10 * Math.PI) / 180,
};

function sectorCenter(dir: Direction): number {
  return SECTORS.indexOf(dir) * SECTOR_SIZE;
}

function angleDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/**
 * @param x stick X, -1 (left) .. 1 (right)
 * @param y stick Y, -1 (up) .. 1 (down), as reported by the Gamepad API
 * @param previous the direction aimed last frame, or null
 */
export function aim(x: number, y: number, previous: Direction | null, cfg: AimConfig = DEFAULT_AIM): Direction | null {
  const magnitude = Math.hypot(x, y);
  const threshold = previous ? cfg.releaseZone : cfg.deadzone;
  if (magnitude < threshold) return null;

  const angle = Math.atan2(y, x);
  if (previous && angleDistance(angle, sectorCenter(previous)) <= SECTOR_SIZE / 2 + cfg.hysteresis) {
    return previous;
  }
  const normalized = (angle + 2 * Math.PI) % (2 * Math.PI);
  const index = Math.round(normalized / SECTOR_SIZE) % SECTORS.length;
  return SECTORS[index]!;
}

/** DCSS vi-keys for each direction (work in both the map and targeting modes). */
export const VI_KEYS: Record<Direction, string> = {
  N: "k", NE: "u", E: "l", SE: "n", S: "j", SW: "b", W: "h", NW: "y",
};

/** Screen offset (in tiles) for each direction, used by the overlay. */
export const OFFSETS: Record<Direction, readonly [number, number]> = {
  N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
};
