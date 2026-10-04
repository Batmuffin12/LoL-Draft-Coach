import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface LcuCredentials {
  port: number;
  password: string;
  protocol: string;
  pid?: number;
}

export class LockfileParseError extends Error {}

/** Parses the client's lockfile: `name:pid:port:password:protocol`. */
export function parseLockfile(content: string): LcuCredentials {
  const parts = content.trim().split(":");
  if (parts.length < 5) throw new LockfileParseError(`Unexpected lockfile format (${parts.length} fields)`);
  const [, pid, port, password, protocol] = parts as [string, string, string, string, string];
  const portNum = Number(port);
  if (!Number.isInteger(portNum) || portNum <= 0) throw new LockfileParseError(`Invalid port in lockfile: ${port}`);
  if (!password) throw new LockfileParseError("Empty password in lockfile");
  return { port: portNum, password, protocol, pid: Number(pid) };
}

/** Extracts port and auth token from a LeagueClientUx.exe command line. */
export function parseCommandLine(commandLine: string): LcuCredentials | null {
  const port = /--app-port=["']?(\d+)/.exec(commandLine)?.[1];
  const password = /--remoting-auth-token=["']?([\w-]+)/.exec(commandLine)?.[1];
  if (!port || !password) return null;
  const pid = /--app-pid=["']?(\d+)/.exec(commandLine)?.[1];
  return { port: Number(port), password, protocol: "https", ...(pid ? { pid: Number(pid) } : {}) };
}

/** Reads LeagueClientUx.exe command lines via CIM (wmic is removed on recent Windows builds). */
export function readClientCommandLines(): Promise<string[]> {
  if (process.platform !== "win32") return Promise.resolve([]);
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | ForEach-Object { $_.CommandLine }";
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 10_000 },
      (err, stdout) => resolve(err ? [] : stdout.split(/\r?\n/).filter((l) => l.trim().length > 0)),
    );
  });
}

export interface DiscoverOptions {
  installDir: string;
  readCommandLines?: () => Promise<string[]>;
  readLockfile?: (path: string) => Promise<string>;
}

/**
 * Finds credentials for the running client: first from the process command line,
 * then from the lockfile in the install folder. Returns null when the client is not running.
 */
export async function discoverCredentials(opts: DiscoverOptions): Promise<LcuCredentials | null> {
  const readLines = opts.readCommandLines ?? readClientCommandLines;
  for (const line of await readLines()) {
    const creds = parseCommandLine(line);
    if (creds) return creds;
  }
  const read = opts.readLockfile ?? ((p: string) => readFile(p, "utf8"));
  try {
    return parseLockfile(await read(join(opts.installDir, "lockfile")));
  } catch {
    return null;
  }
}
