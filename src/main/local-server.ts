// Starts and supervises the bundled DCSS webtiles server (server/deck_server.py) for
// offline play. Plain Node, no Electron imports, so it can be unit tested.

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export interface LocalServerOptions {
  /** Python interpreter with tornado and pyyaml installed. */
  python: string;
  /** Path to deck_server.py. */
  script: string;
  /** crawl-ref/source of a WEBTILES=y build. */
  crawlDir: string;
  /** Writable directory for saves, rc files and the user database. */
  dataDir: string;
  /** Local player name. */
  user?: string;
  /** How long to wait for the server to accept connections. */
  startTimeoutMs?: number;
  /** Log files to keep in <dataDir>/logs. */
  keepLogs?: number;
}

export interface ServerInfo {
  /** Base URL, e.g. http://127.0.0.1:41234/ */
  url: string;
  /** URL that starts (or resumes) the game directly. */
  playUrl: string;
  /** DCSS version reported by the server, e.g. "0.34.1". */
  version: string;
}

export class ServerError extends Error {
  constructor(message: string, readonly log: string[]) {
    super(message);
  }
}

const READY = /^DCSS_DECK_READY game=(\S+) port=(\d+)(?: version=(\S+))?/;
const TAIL_LINES = 60;

/**
 * Emits "exit" ({ code, signal, log }) when a running server stops without stop() being
 * called.
 */
export class LocalServer extends EventEmitter {
  private child: ChildProcess | null = null;
  private starting: Promise<ServerInfo> | null = null;
  private info: ServerInfo | null = null;
  private stopping = false;
  private tail: string[] = [];

  constructor(private readonly opts: LocalServerOptions) {
    super();
  }

  get running(): ServerInfo | null {
    return this.info;
  }

  /** Last lines of server output, for error screens. */
  get log(): string[] {
    return [...this.tail];
  }

  /** Starts the server if needed. Safe to call repeatedly. */
  start(): Promise<ServerInfo> {
    if (this.info) return Promise.resolve(this.info);
    if (!this.starting) {
      this.starting = this.doStart().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    this.stopping = true;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    await exited;
    clearTimeout(timer);
  }

  private async doStart(): Promise<ServerInfo> {
    const { python, script, crawlDir, dataDir } = this.opts;
    for (const [what, p] of [["server script", script], ["DCSS build", path.join(crawlDir, "crawl")]] as const) {
      if (!fs.existsSync(p)) throw new ServerError(`Offline play is not available: ${what} not found at ${p}`, []);
    }

    const port = await freePort();
    const logFile = this.openLog();
    this.tail = [];
    this.stopping = false;

    const child = spawn(python, [
      script, "--crawl-dir", crawlDir, "--data-dir", dataDir,
      "--port", String(port), "--user", this.opts.user ?? "Player",
    ], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONUNBUFFERED: "1" } });
    this.child = child;

    let readyLine: RegExpMatchArray | null = null;
    const onLine = (line: string) => {
      logFile?.write(line + "\n");
      this.tail.push(line);
      if (this.tail.length > TAIL_LINES) this.tail.shift();
      readyLine ??= line.match(READY);
    };
    lines(child.stdout!, onLine);
    lines(child.stderr!, onLine);

    let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    child.on("error", (err) => onLine(`failed to start ${python}: ${err.message}`));
    child.on("exit", (code, signal) => {
      exitInfo = { code, signal };
      logFile?.end();
      const wasRunning = this.info !== null;
      this.info = null;
      this.child = null;
      if (wasRunning && !this.stopping) this.emit("exit", { code, signal, log: this.log });
    });

    // The READY line comes just before the server binds, so also wait for the port.
    const deadline = Date.now() + (this.opts.startTimeoutMs ?? 20000);
    while (Date.now() < deadline) {
      if (exitInfo) {
        const { code, signal } = exitInfo;
        throw new ServerError(`The local DCSS server stopped while starting (${signal ?? `exit code ${code}`}).`, this.log);
      }
      if (readyLine && (await canConnect(port))) {
        const base = `http://127.0.0.1:${port}/`;
        const m: RegExpMatchArray = readyLine;
        this.info = { url: base, playUrl: `${base}#play-${m[1]}`, version: m[3] ?? "" };
        return this.info;
      }
      await sleep(100);
    }
    await this.stop();
    throw new ServerError("The local DCSS server did not start in time.", this.log);
  }

  private openLog(): fs.WriteStream | null {
    try {
      const dir = path.join(this.opts.dataDir, "logs");
      fs.mkdirSync(dir, { recursive: true });
      const keep = this.opts.keepLogs ?? 5;
      const old = fs.readdirSync(dir).filter((f) => /^server-.*\.log$/.test(f)).sort();
      for (const f of old.slice(0, Math.max(0, old.length - (keep - 1)))) fs.rmSync(path.join(dir, f));
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return fs.createWriteStream(path.join(dir, `server-${stamp}.log`));
    } catch {
      return null; // logging is best effort
    }
  }
}

function lines(stream: NodeJS.ReadableStream, onLine: (line: string) => void): void {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      onLine(buf.slice(0, i).replace(/\r$/, ""));
      buf = buf.slice(i + 1);
    }
  });
  stream.on("end", () => {
    if (buf) onLine(buf);
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => resolve(false));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
