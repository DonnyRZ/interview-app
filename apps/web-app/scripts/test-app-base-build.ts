import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const webAppRoot = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(webAppRoot, "dist");
const indexPath = path.join(distRoot, "index.html");

assert.equal(existsSync(indexPath), true, "Build apps/web-app before running this smoke test.");

const html = readFileSync(indexPath, "utf8");
assert.match(html, /\/app\/assets\//, "Web App build must reference assets under /app/assets/.");
assert.doesNotMatch(html, /(?:src|href)="\/assets\//, "Web App build must not reference root /assets/.");
assert.equal(
  existsSync(path.join(distRoot, "audio", "pcm16-processor.js")),
  true,
  "AudioWorklet file must be deployable under /app/audio/pcm16-processor.js."
);
assert.equal(
  existsSync(path.join(distRoot, "assets", "orviko-logo.png")),
  true,
  "Public assets must be copied into the Web App dist assets folder."
);

console.log("[ok] web-app /app/ build contract passed");
