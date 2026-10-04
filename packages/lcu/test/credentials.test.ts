import { describe, expect, it } from "vitest";
import { discoverCredentials, LockfileParseError, parseCommandLine, parseLockfile } from "../src/index";

describe("parseLockfile", () => {
  it("reads port, password and protocol", () => {
    expect(parseLockfile("LeagueClient:1234:54321:s3cr3t-Tok_en:https\n")).toEqual({
      pid: 1234,
      port: 54321,
      password: "s3cr3t-Tok_en",
      protocol: "https",
    });
  });

  it("rejects malformed content", () => {
    expect(() => parseLockfile("garbage")).toThrow(LockfileParseError);
    expect(() => parseLockfile("LeagueClient:1:notaport:pw:https")).toThrow(LockfileParseError);
  });
});

describe("parseCommandLine", () => {
  it("extracts port and token from LeagueClientUx.exe arguments", () => {
    const cmd =
      '"C:/Riot Games/League of Legends/LeagueClientUx.exe" "--riotclient-auth-token=x" "--riotclient-app-port=111" "--app-port=62000" "--remoting-auth-token=AbC-123_x" "--app-pid=999"';
    expect(parseCommandLine(cmd)).toEqual({ port: 62000, password: "AbC-123_x", protocol: "https", pid: 999 });
  });

  it("does not confuse --riotclient-app-port with --app-port", () => {
    expect(parseCommandLine('"--riotclient-app-port=111" "--remoting-auth-token=t"')).toBeNull();
  });

  it("returns null when arguments are missing", () => {
    expect(parseCommandLine("LeagueClientUx.exe")).toBeNull();
  });
});

describe("discoverCredentials", () => {
  it("prefers the process command line", async () => {
    const creds = await discoverCredentials({
      installDir: "X:/lol",
      readCommandLines: async () => ["--app-port=1 --remoting-auth-token=fromProcess"],
      readLockfile: async () => "LeagueClient:1:2:fromLockfile:https",
    });
    expect(creds?.password).toBe("fromProcess");
  });

  it("falls back to the lockfile in the install folder", async () => {
    let readPath = "";
    const creds = await discoverCredentials({
      installDir: "X:/lol",
      readCommandLines: async () => [],
      readLockfile: async (p) => {
        readPath = p;
        return "LeagueClient:1:2:fromLockfile:https";
      },
    });
    expect(creds?.password).toBe("fromLockfile");
    expect(readPath.replaceAll("\\", "/")).toBe("X:/lol/lockfile");
  });

  it("returns null when the client is not running", async () => {
    const creds = await discoverCredentials({
      installDir: "X:/lol",
      readCommandLines: async () => [],
      readLockfile: async () => {
        throw new Error("ENOENT");
      },
    });
    expect(creds).toBeNull();
  });
});
