import { AwsClient } from "aws4fetch";

/** A stored backup file. */
export interface BackupObject {
  key: string;
  /** ms since epoch */
  lastModified: number;
  size: number;
}

/** Where backups go: off-site object storage (Cloudflare R2 in production), or memory in tests. */
export interface BackupStore {
  put(key: string, body: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  list(prefix: string): Promise<BackupObject[]>;
  delete(key: string): Promise<void>;
}

export interface S3Settings {
  /** e.g. https://<account-id>.r2.cloudflarestorage.com */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];
const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Any S3-compatible bucket (path-style requests, SigV4 with region "auto" as R2 expects). */
export class S3BackupStore implements BackupStore {
  private readonly aws: AwsClient;
  private readonly base: string;

  constructor(s: S3Settings) {
    this.aws = new AwsClient({ accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey, service: "s3", region: "auto" });
    this.base = `${s.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(s.bucket)}`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.aws.fetch(`${this.base}${path}`, init);
    if (!res.ok) {
      const code = tag(await res.text().catch(() => ""), "Code");
      throw new Error(`Backup storage: ${init.method ?? "GET"} failed with HTTP ${res.status}${code ? ` (${code})` : ""}`);
    }
    return res;
  }

  private path(key: string): string {
    return `/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async put(key: string, body: Uint8Array): Promise<void> {
    await this.request(this.path(key), { method: "PUT", body: new Uint8Array(body), headers: { "content-type": "application/octet-stream" } });
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.request(this.path(key))).arrayBuffer());
  }

  async list(prefix: string): Promise<BackupObject[]> {
    const out: BackupObject[] = [];
    let token: string | undefined;
    do {
      const q = new URLSearchParams({ "list-type": "2", prefix, ...(token ? { "continuation-token": token } : {}) });
      const xml = await (await this.request(`?${q}`)).text();
      for (const [, item] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        out.push({ key: unescapeXml(tag(item!, "Key") ?? ""), lastModified: Date.parse(tag(item!, "LastModified") ?? ""), size: Number(tag(item!, "Size") ?? 0) });
      }
      token = tag(xml, "IsTruncated") === "true" ? tag(xml, "NextContinuationToken") : undefined;
    } while (token);
    return out;
  }

  async delete(key: string): Promise<void> {
    await this.request(this.path(key), { method: "DELETE" });
  }
}
