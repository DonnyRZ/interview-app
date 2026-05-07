import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(currentDir, "..");
const isWindows = process.platform === "win32";
const helperPath = path.join(desktopRoot, "native", "windows-loopback", "bin", "WasapiLoopbackProbe.exe");
const certificateFile = process.env.WINDOWS_CERTIFICATE_FILE;
const certificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;
const targetPaths = [
  helperPath,
  ...parseExtraTargets(process.env.WINDOWS_SIGN_TARGETS)
];

if (!isWindows) {
  console.log("Skipping Windows helper signing on non-Windows platform.");
  process.exit(0);
}

if (!certificateFile) {
  console.log("Skipping Windows helper signing because WINDOWS_CERTIFICATE_FILE is not set.");
  process.exit(0);
}

if (!certificatePassword) {
  throw new Error("WINDOWS_CERTIFICATE_PASSWORD is required when WINDOWS_CERTIFICATE_FILE is set.");
}

if (!fs.existsSync(certificateFile)) {
  throw new Error(`WINDOWS_CERTIFICATE_FILE does not exist: ${certificateFile}`);
}

for (const targetPath of targetPaths) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Signing target not found at ${targetPath}.`);
  }
}

const signtool = findSignTool();
for (const targetPath of targetPaths) {
  if (signtool) {
    await runCommand(signtool, [
      "sign",
      "/fd",
      "SHA256",
      "/tr",
      "http://timestamp.digicert.com",
      "/td",
      "SHA256",
      "/f",
      certificateFile,
      "/p",
      certificatePassword,
      targetPath
    ], desktopRoot);
  } else {
    console.log("signtool.exe not found. Falling back to PowerShell Set-AuthenticodeSignature for beta/local signing.");
    await runPowerShellAuthenticodeSigning(targetPath);
  }

  console.log(`Signed Windows executable: ${targetPath}`);
}

function parseExtraTargets(rawTargets) {
  if (!rawTargets) return [];
  return rawTargets
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function findSignTool() {
  const explicitPath = process.env.WINDOWS_SIGNTOOL_PATH;
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(`WINDOWS_SIGNTOOL_PATH does not exist: ${explicitPath}`);
    }
    return explicitPath;
  }

  const windowsKitsRoot = "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
  if (!fs.existsSync(windowsKitsRoot)) {
    return null;
  }

  const versions = fs.readdirSync(windowsKitsRoot)
    .filter((entry) => fs.existsSync(path.join(windowsKitsRoot, entry, "x64", "signtool.exe")))
    .sort()
    .reverse();
  const latest = versions[0];
  return latest ? path.join(windowsKitsRoot, latest, "x64", "signtool.exe") : null;
}

async function runPowerShellAuthenticodeSigning(targetPath) {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(",
    "  $env:WINDOWS_CERTIFICATE_FILE,",
    "  $env:WINDOWS_CERTIFICATE_PASSWORD,",
    "  [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable",
    ")",
    "$signature = Set-AuthenticodeSignature -FilePath $env:WINDOWS_SIGN_TARGET -Certificate $cert -HashAlgorithm SHA256",
    "Write-Host \"PowerShell signature status: $($signature.Status)\"",
    "if ($signature.Status -ne 'Valid') { throw \"Authenticode signing failed with status $($signature.Status): $($signature.StatusMessage)\" }"
  ].join("\n");

  await runCommand("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    command
  ], desktopRoot, {
    WINDOWS_SIGN_TARGET: targetPath
  });
}

function runCommand(command, args, cwd, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv
      },
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
