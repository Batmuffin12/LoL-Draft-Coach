/**
 * The renderer half of the LDC_PERF dev aid (apps/desktop/src/main/perf.ts): active only when
 * the main process loads the page with ?perf, which it does only in development builds.
 * Collects when each ViewState arrives, commits and paints, React commit times (with the
 * profiling build), long tasks, animation frames and click → next paint, for main to read.
 */
import type { ViewState } from "../shared/view";

export const perfOn = typeof location !== "undefined" && new URLSearchParams(location.search).has("perf");

const epoch = () => performance.timeOrigin + performance.now();
/** Resolves after the next frame has been painted (rAF, then a task after it). */
const afterPaint = (cb: (at: number) => void) => requestAnimationFrame(() => setTimeout(() => cb(epoch()), 0));

interface Update {
  seq: number;
  sentAt: number;
  receivedAt: number;
  committedAt: number | null;
  paintedAt: number | null;
}

const marks: Record<string, number> = {};
const updates: Update[] = [];
const commits: { id: string; phase: string; actualMs: number; at: number }[] = [];
const longTasks: { at: number; ms: number }[] = [];
const clicks: { target: string; at: number; paintMs: number | null; eventMs: number | null }[] = [];
const frames: number[] = [];
/** Received, not committed yet (a newer state can arrive before React commits: both end with that commit). */
let pending: Update[] = [];

/** A ViewState arrived: when it was sent and received. */
export function perfReceived(state: ViewState): void {
  if (!perfOn) return;
  marks.firstState ??= epoch();
  const p = (state as ViewState & { __perf?: { seq: number; at: number } }).__perf;
  const u = { seq: p?.seq ?? -1, sentAt: p?.at ?? 0, receivedAt: epoch(), committedAt: null, paintedAt: null };
  pending.push(u);
  updates.push(u);
}

/** After React committed a ViewState: the commit time and, a frame later, the paint. */
export function perfCommitted(state: ViewState | null): void {
  if (!perfOn || !state) return;
  const done = pending;
  pending = [];
  const at = epoch();
  for (const u of done) u.committedAt = at;
  const screen = document.querySelector(".window:not(.loading)") !== null;
  const full = screen && state.status.profile.state === "ready" && state.status.patch !== null && (state.meta === null || state.meta.state === "ready");
  afterPaint((painted) => {
    for (const u of done) u.paintedAt = painted;
    if (screen) marks.firstScreen ??= painted;
    if (full) marks.fullScreen ??= painted;
  });
}

/** React <Profiler> onRender (only called in the profiling build). */
export function perfOnRender(id: string, phase: string, actualMs: number): void {
  if (perfOn) commits.push({ id, phase, actualMs, at: epoch() });
}

if (perfOn) {
  const observe = (type: string, cb: (e: PerformanceEntry) => void) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(cb)).observe({ type, buffered: true } as PerformanceObserverInit);
    } catch {
      // Not supported in this Chromium.
    }
  };
  observe("paint", (e) => {
    marks[e.name === "first-contentful-paint" ? "firstContentfulPaint" : "firstPaint"] ??= performance.timeOrigin + e.startTime;
  });
  observe("longtask", (e) => longTasks.push({ at: performance.timeOrigin + e.startTime, ms: e.duration }));
  // Event timing: input → next paint for each click (the INP measure), at 8 ms granularity.
  const eventTimes: { start: number; ms: number }[] = [];
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((e) => (e.name === "click" || e.name === "pointerup") && eventTimes.push({ start: e.startTime, ms: e.duration }))).observe({
      type: "event",
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit);
  } catch {
    // Not supported.
  }
  // Click → next paint, measured directly too (every click, not only those over 16 ms).
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element | null)?.closest("button");
      const sample = { target: el?.textContent?.trim().slice(0, 40) ?? "?", at: performance.timeOrigin + e.timeStamp, paintMs: null as number | null, eventMs: null as number | null };
      clicks.push(sample);
      afterPaint((painted) => {
        sample.paintMs = painted - sample.at;
        // Matched with its event timing entry later (entries arrive after the paint).
        setTimeout(() => {
          const match = eventTimes.find((x) => Math.abs(x.start - e.timeStamp) < 4);
          sample.eventMs = match ? match.ms : null;
        }, 100);
      });
    },
    true,
  );
  // Frame times (animation smoothness): the time between animation frames.
  let lastFrame = 0;
  const frame = (t: number) => {
    if (lastFrame) frames.push(t - lastFrame);
    lastFrame = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  (window as unknown as { __ldcPerf: unknown }).__ldcPerf = {
    marks,
    snapshot: () => ({ timeOrigin: performance.timeOrigin, marks, updates, commits, longTasks, clicks, frames }),
  };
}
