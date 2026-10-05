import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

/** Encrypts the token at rest. In the app this is Electron's safeStorage (OS-level encryption). */
export interface SecretBox {
  encrypt(plain: string): string;
  decrypt(sealed: string): string;
}

export interface Account {
  serverUrl: string;
  token: string;
  /** The Riot ID this token belongs to, to notice when someone else logs into the client. */
  riotId: string;
}

const StoredSchema = z.object({ serverUrl: z.string(), sealedToken: z.string(), riotId: z.string() });

/** Keeps the registered account in one file in the app's user data folder. */
export class AccountStore {
  constructor(
    private readonly file: string,
    private readonly box: SecretBox,
  ) {}

  async load(): Promise<Account | null> {
    try {
      const s = StoredSchema.parse(JSON.parse(await readFile(this.file, "utf8")));
      return { serverUrl: s.serverUrl, riotId: s.riotId, token: this.box.decrypt(s.sealedToken) };
    } catch {
      return null;
    }
  }

  async save(a: Account): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const stored: z.infer<typeof StoredSchema> = { serverUrl: a.serverUrl, riotId: a.riotId, sealedToken: this.box.encrypt(a.token) };
    await writeFile(this.file, JSON.stringify(stored), "utf8");
  }

  async clear(): Promise<void> {
    await rm(this.file, { force: true });
  }
}
