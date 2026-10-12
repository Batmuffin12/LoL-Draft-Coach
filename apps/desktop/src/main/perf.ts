/**
 * Dev aid: LDC_PERF=out.json measures the panel (cold start, the ViewState pipeline, the renderer)
 * and writes the numbers to out.json, then quits. Development builds only, like LDC_SCREENSHOT;
 * `pnpm perf` drives it (scripts/perf). Settings:
 *   LDC_PERF_MODE=startup   quit once the first full screen is painted (cold start)
 *   LDC_PERF_MODE=replay    run LDC_PERF_SECONDS (default 60) while the mock client replays a draft,
 *                           sampling memory; then LDC_PERF_CLICKS; then write and quit
 *   LDC_PERF_CLICKS         JSON list of click targets, each a button's text or "css:<selector>";
 *                           LDC_PERF_CLICK_ROUNDS times (default 1), clicked with real input events
 *   LDC_PERF_T0             epoch ms when the driver spawned the process (cold start measures from it)
 */
import { writeFileSync } from "node:fs";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import type { EventEmitter } from "node:events";
import { app, type BrowserWindow } from "electron";
import type { ViewState } from "../shared/view";

export interface PerfOptions {
  out: string;
  mode: "startup" | "replay";
  seconds: number;
  clicks: string[];
  clickRounds: number;
  t0: number | null;
}

export function perfOptions(packaged: boolean): PerfOptions | null {
  const out = process.env.LDC_PERF;
  if (!out || packaged) return null;
  return {
    out,
    mode: process.env.LDC_PERF_MODE === "startup" ? "startup" : "replay",
    seconds: Number(process.env.LDC_PERF_SECONDS ?? 60),
    clicks: process.env.LDC_PERF_CLICKS ? (JSON.parse(process.env.LDC_PERF_CLICKS) as string[]) : [],
    clickRounds: Number(process.env.LDC_PERF_CLICK_ROUNDS ?? 1),
    t0: process.env.LDC_PERF_T0 ? Number(process.env.LDC_PERF_T0) : null,
  };
}

/** Epoch ms with sub-millisecond precision (comparable across processes on one machine). */
const epoch = () => performance.timeOrigin + performance.now();

interface PushSample {
  seq: number;
  at: number;
  sendMs: number;
  bytes: number;
  /** Exactly the same ViewState as the push before. */
  identical: boolean;
  /** The same apart from the draft's receivedAt timestamp. */
  sameButTime: boolean;
  /** The event that produced it ("lcu:champSelect", "profiles:profile" …), when known. */
  source: string | null;
}

interface EmitSample {
  source: string;
  at: number;
  ms: number;
  /** Pushes sent while the event was handled (synchronously). */
  pushes: number;
  /**
   * The push that carries the event's result: the last one sent while handling it, or else the first
   * one sent after it (e.g. coalesced into the next event-loop turn). Its paint ends the update.
   */
  donePushSeq: number | null;
  /** Time spent on this probe's own bookkeeping during the event (taken out of ms). */
  overhead: number;
}

const withoutTime = (s: ViewState) => JSON.stringify(s.draft ? { ...s, draft: { ...s.draft, receivedAt: 0 } } : s);

export class PerfProbe {
  readonly marks: Record<string, number> = { processStart: performance.timeOrigin, mainEval: epoch() };
  private readonly pushes: PushSample[] = [];
  private readonly emits: EmitSample[] = [];
  private readonly heap: { at: number; rendererUsed: number; mainUsed: number }[] = [];
  private last: { json: string; noTime: string } | null = null;
  private seq = 0;
  /** The event being handled (wrapped emitters), so pushes know their source. */
  private current: EmitSample | null = null;
  /** Events not followed by a push yet. */
  private waiting: EmitSample[] = [];

  /** A full garbage collection in this (main) process: `--js-flags=--expose-gc` reaches only the renderers. */
  private readonly gc: () => void;

  constructor(readonly opts: PerfOptions) {
    if (opts.t0) this.marks.spawn = opts.t0;
    setFlagsFromString("--expose-gc");
    this.gc = runInNewContext("gc") as () => void;
  }

  mark(name: string): void {
    this.marks[name] ??= epoch();
  }

  /** Times every event of an emitter, with the pushes it caused (the synchronous work in main). */
  wrap(name: string, emitter: EventEmitter): void {
    const original = emitter.emit.bind(emitter);
    emitter.emit = ((event: string | symbol, ...args: unknown[]) => {
      if (this.current) return original(event, ...args);
      const sample: EmitSample = { source: `${name}:${String(event)}`, at: epoch(), ms: 0, pushes: 0, donePushSeq: null, overhead: 0 };
      this.waiting.push(sample);
      this.current = sample;
      const start = performance.now();
      try {
        return original(event, ...args);
      } finally {
        sample.ms = performance.now() - start - sample.overhead;
        this.current = null;
        if (sample.pushes > 0) {
          sample.donePushSeq = this.seq;
          this.waiting = this.waiting.filter((e) => e !== sample);
        }
        // Every event that did work or led to a push (the LCU's raw frames alone are left out).
        if (sample.pushes > 0 || sample.ms > 0.05 || event !== "rawEvent") this.emits.push(sample);
      }
    }) as typeof emitter.emit;
  }

  /** Sends a ViewState with its sequence number and send time, and records the push. */
  send(win: BrowserWindow, channel: string, state: ViewState): void {
    const seq = ++this.seq;
    const at = epoch();
    // Events finished before this push get it as their result (the one being handled waits for its end).
    for (const e of this.waiting) if (e !== this.current) e.donePushSeq = seq;
    this.waiting = this.waiting.filter((e) => e === this.current);
    const start = performance.now();
    win.webContents.send(channel, { ...state, __perf: { seq, at } });
    const sent = performance.now();
    const json = JSON.stringify(state);
    const noTime = withoutTime(state);
    this.pushes.push({ seq, at, sendMs: sent - start, bytes: Buffer.byteLength(json), identical: this.last?.json === json, sameButTime: this.last?.noTime === noTime, source: this.current?.source ?? null });
    this.last = { json, noTime };
    if (this.current) {
      this.current.pushes++;
      this.current.overhead += performance.now() - sent;
    }
  }

  /** Startup: waits for the first full screen, then writes and quits. Replay: runs, clicks, writes, quits. */
  run(win: BrowserWindow): void {
    if (this.opts.mode === "startup") {
      const timer = setInterval(async () => {
        const done = await read<boolean>(win, "!!(window.__ldcPerf && window.__ldcPerf.marks.fullScreen)");
        if (done || epoch() - this.marks.processStart! > 30_000) {
          clearInterval(timer);
          await this.finish(win);
        }
      }, 50);
      return;
    }
    const sampler = setInterval(() => void this.sampleHeap(win), 10_000);
    setTimeout(async () => {
      clearInterval(sampler);
      await this.sampleHeap(win);
      for (let round = 0; round < this.opts.clickRounds; round++) {
        for (const target of this.opts.clicks) await click(win, target);
      }
      await new Promise((r) => setTimeout(r, 500));
      await this.finish(win);
    }, this.opts.seconds * 1000);
  }

  private async sampleHeap(win: BrowserWindow): Promise<void> {
    // Collect garbage first, so the samples show what is kept, not what is waiting to be freed.
    this.gc();
    const rendererUsed = await read<number>(win, "(window.gc && window.gc(), performance.memory ? performance.memory.usedJSHeapSize : 0)");
    this.heap.push({ at: epoch(), rendererUsed: rendererUsed ?? 0, mainUsed: process.memoryUsage().heapUsed });
  }

  private async finish(win: BrowserWindow): Promise<void> {
    const renderer = await read<unknown>(win, "window.__ldcPerf ? window.__ldcPerf.snapshot() : null");
    const metrics = app.getAppMetrics().map((m) => ({ type: m.type, cpu: m.cpu.percentCPUUsage, cpuIdleWakeups: m.cpu.idleWakeupsPerSecond, workingSetKb: m.memory.workingSetSize, privateKb: m.memory.privateBytes ?? null }));
    writeFileSync(
      this.opts.out,
      JSON.stringify({ mode: this.opts.mode, versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node }, marks: this.marks, pushes: this.pushes, emits: this.emits, heap: this.heap, metrics, renderer }, null, 1),
    );
    app.quit();
  }
}

async function read<T>(win: BrowserWindow, js: string): Promise<T | null> {
  if (win.isDestroyed()) return null;
  // Never wait for a busy or crashed page for long.
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 5_000));
  return Promise.race([(win.webContents.executeJavaScript(js) as Promise<T>).catch(() => null), timeout]);
}

/** Clicks a button (by its text, or "css:<selector>") with real mouse events, then waits for the screen to settle. */
async function click(win: BrowserWindow, target: string): Promise<void> {
  const find = target.startsWith("css:")
    ? `document.querySelector(${JSON.stringify(target.slice(4))})`
    : `(() => { const t = ${JSON.stringify(target)}; const all = [...document.querySelectorAll("button")]; return all.find((x) => x.textContent.trim() === t) ?? all.find((x) => x.textContent.trim().startsWith(t)); })()`;
  const box = await read<{ x: number; y: number } | null>(win, `(() => { const b = ${find}; if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  if (!box) {
    console.log(`LDC_PERF: no button "${target}"`);
    return;
  }
  const zoom = win.webContents.getZoomFactor();
  const at = { x: Math.round(box.x * zoom), y: Math.round(box.y * zoom) };
  win.webContents.sendInputEvent({ type: "mouseMove", ...at });
  win.webContents.sendInputEvent({ type: "mouseDown", ...at, button: "left", clickCount: 1 });
  win.webContents.sendInputEvent({ type: "mouseUp", ...at, button: "left", clickCount: 1 });
  await new Promise((r) => setTimeout(r, 250));
}
