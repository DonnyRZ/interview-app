import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(currentDir, "..");
const isWindows = process.platform === "win32";

if (!isWindows) {
  console.log("Skipping Windows loopback helper build on non-Windows platform.");
  process.exit(0);
}

const sourcePath = path.join(desktopRoot, "native", "windows-loopback", "WasapiLoopbackProbe.cs");
const outputDir = path.join(desktopRoot, "native", "windows-loopback", "bin");
const outputPath = path.join(outputDir, "WasapiLoopbackProbe.exe");
const cscCandidates = [
  "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
  "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"
];
const cscPath = cscCandidates.find((candidate) => fs.existsSync(candidate));

if (!cscPath) {
  throw new Error("C# compiler not found. Expected .NET Framework csc.exe for Windows loopback helper.");
}

fs.mkdirSync(outputDir, { recursive: true });

await runCommand(cscPath, [
  "/nologo",
  "/optimize+",
  "/platform:anycpu",
  `/out:${outputPath}`,
  sourcePath
], desktopRoot);

console.log(`Built Windows loopback helper: ${outputPath}`);

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });

    child.on("error", reject);
  });
}
