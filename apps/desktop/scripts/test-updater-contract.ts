import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  canCheckForDesktopUpdate,
  canDownloadDesktopUpdate,
  canInstallDesktopUpdate,
  clampDesktopUpdateProgress,
  downloadedDesktopUpdateStatus,
  type DesktopUpdaterState
} from "../electron/app-updater-policy.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as {
  version: string;
  dependencies?: Record<string, string>;
};
const builderConfig = require("../electron-builder.config.cjs") as {
  artifactName?: string;
  extraResources?: Array<{ from?: string; to?: string }>;
  publish?: Array<{ provider?: string; url?: string }>;
  win?: { icon?: string; signAndEditExecutable?: boolean; target?: Array<{ target?: string }> };
};
const devLandingPage = readFileSync(new URL("../../web/index.html", import.meta.url), "utf8");

const availableState: DesktopUpdaterState = {
  status: "available",
  currentVersion: "0.1.1",
  availableVersion: "0.1.2"
};

assert.equal(canDownloadDesktopUpdate(availableState), true);
assert.equal(canDownloadDesktopUpdate({ status: "error", currentVersion: "0.1.1" }), false);
assert.equal(canInstallDesktopUpdate({ status: "ready", currentVersion: "0.1.1" }), true);
assert.equal(canInstallDesktopUpdate(availableState), false);
assert.equal(downloadedDesktopUpdateStatus(false), "ready");
assert.equal(downloadedDesktopUpdateStatus(true), "waiting-for-meeting");
assert.equal(canCheckForDesktopUpdate({ status: "idle", currentVersion: "0.1.1" }), true);
assert.equal(canCheckForDesktopUpdate({ status: "downloading", currentVersion: "0.1.1" }), false);
assert.equal(clampDesktopUpdateProgress(-4), 0);
assert.equal(clampDesktopUpdateProgress(42.6), 43);
assert.equal(clampDesktopUpdateProgress(140), 100);

assert.equal(packageJson.version, "0.1.1");
assert.equal(typeof packageJson.dependencies?.["electron-updater"], "string");
assert.equal(builderConfig.artifactName, "Orviko-Setup-${version}-dev.${ext}");
assert.deepEqual(builderConfig.publish, [{
  provider: "generic",
  url: "https://dev.orviko.net/updates/windows/"
}]);
assert.equal(builderConfig.win?.target?.[0]?.target, "nsis");
assert.equal(builderConfig.win?.icon?.replaceAll("\\", "/"), "build/icon.ico");
assert.equal(builderConfig.win?.signAndEditExecutable, false);
assert.equal(builderConfig.extraResources?.some((resource) => resource.to === "icon.ico"), true);
assert.equal(existsSync(new URL("../build/icon.ico", import.meta.url)), true);
assert.equal(devLandingPage.includes("Orviko-Setup-0.1.0-dev.exe"), false);
assert.equal(
  devLandingPage.match(/\/updates\/windows\/Orviko-Setup-0\.1\.1-dev\.exe/g)?.length,
  4
);

console.log("Desktop updater contract tests passed.");
