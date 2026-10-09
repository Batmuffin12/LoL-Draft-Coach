/** The server's version, from its package.json (bundled at build time), so /health can't fall behind a release. */
import pkg from "../package.json";

export const SERVER_VERSION: string = pkg.version;
