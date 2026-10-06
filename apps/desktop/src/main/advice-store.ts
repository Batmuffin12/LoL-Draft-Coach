import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { AdviceRecord } from "@ldc/shared";
import { AdviceRecordSchema } from "./server-client";

/** Advice kept locally in dev-only direct mode (the server keeps it in server mode). */
export const LOCAL_ADVICE_KEPT = 50;

/** The advice log on this PC, for dev-only direct mode: one JSON file, newest first. */
export class AdviceStore {
  constructor(private readonly file: string) {}

  async list(): Promise<AdviceRecord[]> {
    try {
      const parsed = z.array(AdviceRecordSchema).safeParse(JSON.parse(await readFile(this.file, "utf8")));
      return parsed.success ? (parsed.data as AdviceRecord[]) : [];
    } catch {
      return [];
    }
  }

  /** Adds (or replaces, for the same game) one record and returns the list, newest first. */
  async add(record: AdviceRecord): Promise<AdviceRecord[]> {
    const list = mergeAdvice(await this.list(), record).slice(0, LOCAL_ADVICE_KEPT);
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(list), "utf8");
    return list;
  }
}

/** The list with `record` in it (replacing one for the same game), newest first. */
export function mergeAdvice(list: AdviceRecord[], record: AdviceRecord): AdviceRecord[] {
  return [record, ...list.filter((a) => a.gameId !== record.gameId)].sort((a, b) => b.lockedAt - a.lockedAt);
}
