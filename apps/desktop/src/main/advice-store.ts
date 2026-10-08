import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { AdviceRecord } from "@ldc/shared";
import { AdviceRecordSchema } from "./server-client";

/** Advice kept locally in dev-only direct mode (the server keeps it in server mode). */
export const LOCAL_ADVICE_KEPT = 50;

/**
 * Advice records on this PC in one JSON file, newest first: the advice log in dev-only direct
 * mode, and in server mode the outbox of records the server hasn't confirmed yet.
 */
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
    await this.write(list);
    return list;
  }

  /** Removes the records for these games and returns the rest. */
  async remove(gameIds: Iterable<number>): Promise<AdviceRecord[]> {
    const drop = new Set(gameIds);
    const list = (await this.list()).filter((a) => !drop.has(a.gameId));
    await this.write(list);
    return list;
  }

  private async write(list: AdviceRecord[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(list), "utf8");
  }
}

/** The list with `record` in it (replacing one for the same game), newest first. */
export function mergeAdvice(list: AdviceRecord[], record: AdviceRecord): AdviceRecord[] {
  return [record, ...list.filter((a) => a.gameId !== record.gameId)].sort((a, b) => b.lockedAt - a.lockedAt);
}
