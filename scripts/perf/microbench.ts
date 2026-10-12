/**
 * A small benchmark runner for `pnpm perf` (vitest 5 dropped `bench()`): warm-up runs, then timed
 * runs of a function, reported as median, p95 and spread in ms.
 */
import { writeFileSync } from "node:fs";

export interface BenchResult {
  name: string;
  runs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

const results: BenchResult[] = [];

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;

/** Times `fn` `runs` times after `warmup` untimed runs (at least 30 timed runs unless set). */
export async function measure(name: string, fn: () => unknown, opts: { runs?: number; warmup?: number } = {}): Promise<BenchResult> {
  const runs = opts.runs ?? 30;
  for (let i = 0; i < (opts.warmup ?? 3); i++) await fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const r = { name, runs, medianMs: quantile(times, 0.5), p95Ms: quantile(times, 0.95), minMs: times[0]!, maxMs: times.at(-1)! };
  results.push(r);
  process.stdout.write(`${name}: median ${r.medianMs.toFixed(2)} ms, p95 ${r.p95Ms.toFixed(2)} ms\n`);
  return r;
}

/** Writes every result so far to the file given as the script's first argument (if any). */
export function save(): void {
  const out = process.argv[2];
  if (out) writeFileSync(out, JSON.stringify(results, null, 1));
}
