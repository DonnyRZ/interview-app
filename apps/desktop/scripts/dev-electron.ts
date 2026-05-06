import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(currentDir, "..");
const workspaceRoot = path.resolve(desktopRoot, "../..");
const rendererUrl = "http://127.0.0.1:5173";
const isWindows = process.platform === "win32";

const tscBin = path.join(workspaceRoot, "node_modules", ".bin", isWindows ? "tsc.cmd" : "tsc");
await runCommand(tscBin, ["-p", "tsconfig.electron.json"], desktopRoot);

const viteProcess = spawn(isWindows ? "npm.cmd" : "npm", ["run", "dev:renderer"], {
  cwd: desktopRoot,
  stdio: "inherit",
  shell: isWindows
});

await waitForPort(5173, "127.0.0.1");

const electronBin = path.join(workspaceRoot, "node_modules", ".bin", isWindows ? "electron.cmd" : "electron");
const electronProcess = spawn(electronBin, ["."], {
  cwd: desktopRoot,
  stdio: "inherit",
  shell: isWindows,
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: rendererUrl
  }
});

electronProcess.on("exit", (code) => {
  viteProcess.kill();
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  electronProcess.kill();
  viteProcess.kill();
  process.exit(0);
});

function waitForPort(port: number, host: string) {
  return new Promise<void>((resolve) => {
    const tryConnect = () => {
      const socket = net.connect(port, host);
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        setTimeout(tryConnect, 120);
      });
    };
    tryConnect();
  });
}

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: isWindows
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });

    child.on("error", reject);
  });
}
