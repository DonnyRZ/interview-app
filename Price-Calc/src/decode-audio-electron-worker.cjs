const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { readFile, writeFile } = require("node:fs/promises");

const debug = process.env.ORVIKO_AUDIO_DECODER_DEBUG === "1";
const logDebug = (message) => {
  if (debug) {
    console.error(`[decoder] ${message}`);
  }
};

process.on("uncaughtException", (error) => {
  console.error(error instanceof Error ? error.stack : error);
  app.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error(error instanceof Error ? error.stack : error);
  app.exit(1);
});

const scriptArgIndex = process.argv.findIndex((value) => value.endsWith("decode-audio-electron-worker.cjs"));
const appArgIndex = process.argv.findIndex((value) => value.endsWith("electron-audio-decoder"));
const argumentStartIndex = scriptArgIndex >= 0 ? scriptArgIndex + 1 : appArgIndex >= 0 ? appArgIndex + 1 : 2;
const positionalArgs = process.argv.slice(argumentStartIndex).filter((value) => value !== "--");
logDebug(`argv=${JSON.stringify(process.argv)}`);
logDebug(`positional=${JSON.stringify(positionalArgs)}`);
const [audioPath, outputPath, rawOptions = "{}"] = positionalArgs;

if (!audioPath || !outputPath) {
  console.error("Usage: electron decode-audio-electron-worker.cjs <audioPath> <outputPath> [jsonOptions]");
  process.exit(1);
}

let options;
try {
  options = JSON.parse(rawOptions);
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}

const targetSampleRate = Number(options.targetSampleRate || 24000);
const chunkMs = Number(options.chunkMs || 40);
const maxSeconds = Number.isFinite(Number(options.maxSeconds)) ? Number(options.maxSeconds) : null;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("no-sandbox");
const electronStateDir = path.join(process.cwd(), "Price-Calc", "outputs", ".electron-audio-decoder-state");
fs.mkdirSync(electronStateDir, { recursive: true });
app.setPath("userData", electronStateDir);
app.setPath("cache", path.join(electronStateDir, "cache"));
logDebug("registered Electron startup");

const keepAlive = setInterval(() => undefined, 1000);

app.on("quit", (_event, exitCode) => {
  logDebug(`quit exitCode=${exitCode}`);
});

app.on("ready", () => {
  logDebug("ready event received");
  run().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    app.exit(1);
  });
});

setImmediate(() => {
  logDebug(`setImmediate isReady=${app.isReady()}`);
});

async function run() {
  logDebug("Electron app is ready");

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false
    }
  });

  let exitCode = 0;
  try {
    logDebug("loading renderer");
    await window.loadURL("data:text/html,<html><body></body></html>");

    logDebug("reading audio file");
    const audioBase64 = (await readFile(audioPath)).toString("base64");

    logDebug("decoding audio in renderer");
    const result = await window.webContents.executeJavaScript(`
      (async () => {
        const audioBase64 = ${JSON.stringify(audioBase64)};
        const targetSampleRate = ${JSON.stringify(targetSampleRate)};
        const chunkMs = ${JSON.stringify(chunkMs)};
        const maxSeconds = ${JSON.stringify(maxSeconds)};

        function base64ToArrayBuffer(base64) {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return bytes.buffer;
        }

        function floatToPcm16Base64(samples) {
          let binary = "";
          for (let index = 0; index < samples.length; index += 1) {
            const clamped = Math.max(-1, Math.min(1, samples[index] || 0));
            const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
            const int = Math.round(value);
            binary += String.fromCharCode(int & 0xff, (int >> 8) & 0xff);
          }
          return btoa(binary);
        }

        function resampleMono(audioBuffer, targetRate, maxSeconds) {
          const sourceRate = audioBuffer.sampleRate;
          const sourceChannels = Array.from({ length: audioBuffer.numberOfChannels }, (_, channel) => audioBuffer.getChannelData(channel));
          const sourceLength = maxSeconds ? Math.min(audioBuffer.length, Math.floor(maxSeconds * sourceRate)) : audioBuffer.length;
          const targetLength = Math.max(1, Math.floor(sourceLength * targetRate / sourceRate));
          const mono = new Float32Array(targetLength);

          for (let targetIndex = 0; targetIndex < targetLength; targetIndex += 1) {
            const sourcePosition = targetIndex * sourceRate / targetRate;
            const leftIndex = Math.min(sourceLength - 1, Math.floor(sourcePosition));
            const rightIndex = Math.min(sourceLength - 1, leftIndex + 1);
            const ratio = sourcePosition - leftIndex;
            let mixed = 0;
            for (const channel of sourceChannels) {
              const left = channel[leftIndex] || 0;
              const right = channel[rightIndex] || left;
              mixed += left + (right - left) * ratio;
            }
            mono[targetIndex] = mixed / Math.max(1, sourceChannels.length);
          }

          return mono;
        }

        const context = new AudioContext();
        const decoded = await context.decodeAudioData(base64ToArrayBuffer(audioBase64));
        const mono = resampleMono(decoded, targetSampleRate, maxSeconds);
        await context.close();

        const framesPerChunk = Math.max(1, Math.round(targetSampleRate * chunkMs / 1000));
        const chunks = [];
        for (let offset = 0; offset < mono.length; offset += framesPerChunk) {
          const samples = mono.slice(offset, Math.min(mono.length, offset + framesPerChunk));
          chunks.push({
            index: chunks.length,
            startMs: offset / targetSampleRate * 1000,
            durationMs: samples.length / targetSampleRate * 1000,
            audio: floatToPcm16Base64(samples)
          });
        }

        return {
          sourceSampleRate: decoded.sampleRate,
          sourceChannels: decoded.numberOfChannels,
          sourceDurationSeconds: decoded.duration,
          targetSampleRate,
          chunkMs,
          durationSeconds: mono.length / targetSampleRate,
          totalFrames: mono.length,
          chunks
        };
      })()
    `);

    await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
    logDebug("decoder output written");
  } catch (error) {
    exitCode = 1;
    console.error(error instanceof Error ? error.stack : error);
  } finally {
    clearInterval(keepAlive);
    window.destroy();
    app.exit(exitCode);
  }
}
