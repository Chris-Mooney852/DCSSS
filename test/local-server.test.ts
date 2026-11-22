import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalServer, ServerError } from "../src/main/local-server";

const SCRIPT = path.join(__dirname, "fixtures", "fake_server.py");
let tmp: string;
let server: LocalServer | null = null;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dcss-deck-test-"));
  fs.mkdirSync(path.join(tmp, "crawl"));
  fs.writeFileSync(path.join(tmp, "crawl", "crawl"), "");
});

afterEach(async () => {
  await server?.stop();
  server = null;
  delete process.env.FAKE_MODE;
  fs.rmSync(tmp, { recursive: true, force: true });
});

function make(mode: string, startTimeoutMs = 5000): LocalServer {
  process.env.FAKE_MODE = mode;
  server = new LocalServer({
    python: "python3", script: SCRIPT, crawlDir: path.join(tmp, "crawl"),
    dataDir: path.join(tmp, "data"), startTimeoutMs,
  });
  return server;
}

describe("LocalServer", () => {
  it("starts, reports the play URL and version, and writes a log", async () => {
    const s = make("ok");
    const info = await s.start();
    expect(info.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(info.playUrl).toBe(`${info.url}#play-dcss-deck`);
    expect(info.version).toBe("9.9");
    expect((await fetch(info.url)).ok).toBe(true);
    expect(fs.readdirSync(path.join(tmp, "data", "logs"))).toHaveLength(1);
  });

  it("returns the same server when started twice", async () => {
    const s = make("ok");
    const [a, b] = await Promise.all([s.start(), s.start()]);
    expect(a).toBe(b);
    expect(await s.start()).toBe(a);
  });

  it("reports a startup crash with the server output", async () => {
    const s = make("crash");
    const err = await s.start().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect((err as ServerError).message).toContain("exit code 3");
    expect((err as ServerError).log.join("\n")).toContain("something broke");
  });

  it("gives up if the server never becomes ready", async () => {
    const s = make("slow", 800);
    await expect(s.start()).rejects.toThrow("did not start in time");
  });

  it("emits exit when a running server dies, but not on stop()", async () => {
    const s = make("die-later");
    await s.start();
    const exit = await new Promise<{ code: number; log: string[] }>((r) => s.once("exit", r));
    expect(exit.code).toBe(1);
    expect(exit.log.join("\n")).toContain("crawl went away");
    expect(s.running).toBeNull();

    const s2 = make("ok");
    let emitted = false;
    s2.on("exit", () => { emitted = true; });
    await s2.start();
    await s2.stop();
    expect(emitted).toBe(false);
  });

  it("explains when the DCSS build is missing", async () => {
    fs.rmSync(path.join(tmp, "crawl", "crawl"));
    await expect(make("ok").start()).rejects.toThrow("DCSS build not found");
  });

  it("keeps only the newest log files", async () => {
    const logs = path.join(tmp, "data", "logs");
    fs.mkdirSync(logs, { recursive: true });
    for (let i = 0; i < 7; i++) fs.writeFileSync(path.join(logs, `server-2026-01-0${i}.log`), "");
    await make("ok").start();
    expect(fs.readdirSync(logs)).toHaveLength(5);
  });
});
