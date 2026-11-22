// Types shared by the main process, the preload and the launcher page.

export interface ErrorReport {
  message: string;
  /** Last lines of server output. */
  log: string[];
}

export interface LauncherInfo {
  offline: { available: boolean; version: string };
  /** Set after the offline server failed to start or crashed. */
  error: ErrorReport | null;
  /** Where saves and settings live, shown on the error screen. */
  dataDir: string;
}

export type PlayResult = { ok: true } | ({ ok: false } & ErrorReport);

/** The API the preload exposes to the launcher page as `window.deck`. */
export interface DeckApi {
  info(): Promise<LauncherInfo>;
  playOffline(): Promise<PlayResult>;
  open(url: string): void;
  quit(): void;
}
