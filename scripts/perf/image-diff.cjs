// Compares screenshot sets pixel by pixel, run with Electron (its nativeImage decodes PNGs; no extra
// dependency): electron scripts/perf/image-diff.cjs <dirA> <dirB> <out.json> [diffDir]
// Writes, per image, how many pixels differ and (in diffDir) a copy of B with the differences in magenta.
// The champ select timer ring (top left of the phase band) counts down while the screenshot is taken,
// so its area is left out on screens that have one.
const { app, nativeImage } = require("electron");
const { existsSync, mkdirSync, readdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

app.disableHardwareAcceleration();

/** The timer ring area at 440 x 720, zoom 1 (header 36 px, then the band with the 64 px ring). */
const RING = { x0: 8, x1: 92, y0: 38, y1: 126 };
const hasRing = (name) => /^(Ban|Pick|LockedIn)/.test(name);
app.whenReady().then(() => {
  const [a, b, out, diffDir] = process.argv.slice(2).filter((x) => !x.startsWith("--") && !x.endsWith("image-diff.cjs") && x !== ".");
  const result = {};
  if (diffDir) mkdirSync(diffDir, { recursive: true });
  for (const name of readdirSync(a).filter((f) => f.endsWith(".png"))) {
    if (!existsSync(join(b, name))) {
      result[name] = { missing: true };
      continue;
    }
    const ia = nativeImage.createFromPath(join(a, name));
    const ib = nativeImage.createFromPath(join(b, name));
    const sa = ia.getSize();
    const sb = ib.getSize();
    if (sa.width !== sb.width || sa.height !== sb.height) {
      result[name] = { sizeA: sa, sizeB: sb, diffPixels: null };
      continue;
    }
    const pa = ia.toBitmap();
    const pb = ib.toBitmap();
    const marked = Buffer.from(pb);
    let diff = 0;
    let masked = 0;
    const box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
    for (let i = 0; i < pa.length; i += 4) {
      const x = (i / 4) % sa.width;
      const y = Math.floor(i / 4 / sa.width);
      const inRing = hasRing(name) && x >= RING.x0 && x <= RING.x1 && y >= RING.y0 && y <= RING.y1;
      // A small tolerance for anti-aliasing noise.
      if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 24) {
        if (inRing) {
          masked++;
          continue;
        }
        diff++;
        Object.assign(box, { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) });
        marked[i] = 255; // BGRA: magenta
        marked[i + 1] = 0;
        marked[i + 2] = 255;
        marked[i + 3] = 255;
      }
    }
    result[name] = { width: sa.width, height: sa.height, diffPixels: diff, maskedTimerPixels: masked, box: diff ? box : null, share: diff / (sa.width * sa.height) };
    if (diffDir && diff > 0) writeFileSync(join(diffDir, name), nativeImage.createFromBitmap(marked, sa).toPNG());
  }
  writeFileSync(out, JSON.stringify(result, null, 2));
  app.quit();
});
