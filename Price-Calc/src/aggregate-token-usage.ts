import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

type NumberSummary = {
  min: number;
  avg: number;
  median: number;
  max: number;
  values: number[];
};

const preprocessingSummaryPath = readArg("--preprocessing-summary");
const liveRoot = readArg("--live-root");
const outputDir = path.resolve(readArg("--output-dir") || path.join("Price-Calc", "outputs", `token-usage-audit-${timestamp()}`));
const targetMinutes = Number(readArg("--target-minutes") || "45");

if (!preprocessingSummaryPath) {
  throw new Error("--preprocessing-summary is required.");
}
if (!liveRoot) {
  throw new Error("--live-root is required.");
}

const preprocessingSummary = await readJson(preprocessingSummaryPath);
const liveSummaries = await loadLiveSummaries(liveRoot);

if (!liveSummaries.length) {
  throw new Error(`No live summary.json files found under ${liveRoot}.`);
}

const aggregate = buildAggregate(preprocessingSummary, liveSummaries);
await mkdir(outputDir, { recursive: true });
await writeJson(path.join(outputDir, "summary.json"), aggregate);
await writeFile(path.join(outputDir, "README.md"), renderMarkdown(aggregate), "utf8");

console.log(JSON.stringify({
  outputDir,
  preprocessingRuns: aggregate.preprocessing.runs,
  liveRuns: aggregate.live.runs,
  liveValidation: aggregate.live.validation
}, null, 2));

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loadLiveSummaries(root: string) {
  const resolvedRoot = path.resolve(root);
  const children = await readdir(resolvedRoot, { withFileTypes: true });
  const summaryPaths = children
    .filter((item) => item.isDirectory())
    .map((item) => path.join(resolvedRoot, item.name, "summary.json"))
    .filter((summaryPath) => existsSync(summaryPath));

  const summaries = [];
  for (const summaryPath of summaryPaths) {
    const summary = await readJson(summaryPath);
    summaries.push({
      path: summaryPath,
      summary
    });
  }

  return summaries.sort((left, right) => left.path.localeCompare(right.path));
}

function buildAggregate(preprocessing: Record<string, unknown>, liveItems: Array<{ path: string; summary: Record<string, unknown> }>) {
  const liveRuns = liveItems.map((item) => item.summary);
  const usageKeys = Array.from(new Set(liveRuns.flatMap((run) => Object.keys(readObject(readObject(run.usage).totals)))));
  const usageByKey = Object.fromEntries(usageKeys.map((key) => [
    key,
    summarizeNumbers(liveRuns.map((run) => numberValue(readObject(readObject(run.usage).totals)[key])))
  ]));

  const sampleMinutes = summarizeNumbers(liveRuns.map((run) => numberValue(readObject(run.projection).sampleMinutes)));
  const scaleFactors = liveRuns.map((run) => targetMinutes / (numberValue(readObject(run.projection).sampleMinutes) || targetMinutes));

  const coreUsage = {
    realtimeInputTokens: summarizeLiveMetric(liveRuns, [
      "input_tokens",
      "total_tokens.input_tokens"
    ]),
    realtimeCachedInputTokens: summarizeLiveMetric(liveRuns, [
      "input_token_details.cached_tokens",
      "input_tokens_details.cached_tokens",
      "total_tokens.input_token_details.cached_tokens",
      "total_tokens.input_tokens_details.cached_tokens",
      "cached_tokens"
    ]),
    realtimeOutputTokens: summarizeLiveMetric(liveRuns, [
      "output_tokens",
      "total_tokens.output_tokens"
    ]),
    audioInputTokens: summarizeLiveMetric(liveRuns, [
      "input_token_details.audio_tokens",
      "input_tokens_details.audio_tokens",
      "total_tokens.input_token_details.audio_tokens",
      "total_tokens.input_tokens_details.audio_tokens",
      "audio_tokens"
    ]),
    textInputTokens: summarizeLiveMetric(liveRuns, [
      "input_token_details.text_tokens",
      "input_tokens_details.text_tokens",
      "total_tokens.input_token_details.text_tokens",
      "total_tokens.input_tokens_details.text_tokens"
    ]),
    textOutputTokens: summarizeLiveMetric(liveRuns, [
      "output_token_details.text_tokens",
      "output_tokens_details.text_tokens",
      "total_tokens.output_token_details.text_tokens",
      "total_tokens.output_tokens_details.text_tokens"
    ])
  };

  return {
    generatedAt: new Date().toISOString(),
    targetMinutes,
    inputs: {
      preprocessingSummaryPath: path.resolve(preprocessingSummaryPath!),
      liveRoot: path.resolve(liveRoot!)
    },
    preprocessing: summarizePreprocessing(preprocessing),
    live: {
      runs: liveRuns.length,
      validation: summarizeValidation(liveRuns),
      sampleMinutes,
      projectedScaleFactor: summarizeNumbers(scaleFactors),
      requests: {
        helpClicksScheduled: summarizeNumbers(liveRuns.map((run) => numberValue(readObject(run.requests).helpClicksScheduled))),
        helpClicksCompleted: summarizeNumbers(liveRuns.map((run) => numberValue(readObject(run.requests).helpClicksCompleted))),
        keywordRequests: summarizeNumbers(liveRuns.map((run) => numberValue(readObject(run.requests).keywordRequests))),
        transcriptTurns: summarizeNumbers(liveRuns.map((run) => numberValue(readObject(run.requests).transcriptTurns))),
        usageRecords: summarizeNumbers(liveRuns.map((run) => numberValue(readObject(run.usage).records)))
      },
      coreUsage,
      projected45MinuteCoreUsage: Object.fromEntries(Object.entries(coreUsage).map(([key, value]) => [
        key,
        projectSummary(value, scaleFactors)
      ])),
      allUsageKeys: usageByKey,
      runDetails: liveItems.map((item) => ({
        path: item.path,
        mode: item.summary.mode,
        contextVariant: item.summary.contextVariant,
        validation: readObject(item.summary.validation).status,
        requests: item.summary.requests,
        usage: item.summary.usage
      }))
    }
  };
}

function summarizePreprocessing(summary: Record<string, unknown>) {
  const runs = Array.isArray(summary.runs) ? summary.runs : [];
  const totals = readObject(summary.totals);
  return {
    model: summary.model,
    runs: runs.length,
    profile: normalizePreprocessingUsage(readObject(totals.profile)),
    meetingContext: normalizePreprocessingUsage(readObject(totals.meetingContext)),
    combined: normalizePreprocessingUsage(readObject(totals.combined))
  };
}

function normalizePreprocessingUsage(usage: Record<string, unknown>) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens
  };
}

function summarizeValidation(liveRuns: Array<Record<string, unknown>>) {
  const statuses = liveRuns.map((run) => String(readObject(run.validation).status || "unknown"));
  return {
    statuses,
    validRuns: statuses.filter((status) => status === "valid").length,
    invalidRuns: statuses.filter((status) => status !== "valid").length
  };
}

function summarizeLiveMetric(liveRuns: Array<Record<string, unknown>>, keys: string[]) {
  return summarizeNumbers(liveRuns.map((run) => readFirstNumber(readObject(readObject(run.usage).totals), keys)));
}

function readFirstNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(source[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function projectSummary(summary: NumberSummary, scaleFactors: number[]) {
  return summarizeNumbers(summary.values.map((value, index) => value * scaleFactors[index]));
}

function summarizeNumbers(values: Array<number | null>): NumberSummary {
  const numeric = values.map((value) => value ?? 0);
  const sorted = [...numeric].sort((left, right) => left - right);
  const sum = numeric.reduce((total, value) => total + value, 0);
  return {
    min: sorted[0] ?? 0,
    avg: numeric.length ? sum / numeric.length : 0,
    median: median(sorted),
    max: sorted[sorted.length - 1] ?? 0,
    values: numeric
  };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]
    : ((values[middle - 1] || 0) + (values[middle] || 0)) / 2;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function renderMarkdown(aggregate: ReturnType<typeof buildAggregate>) {
  const lines = [
    "# Orviko Token Usage Audit",
    "",
    `Generated at: ${aggregate.generatedAt}`,
    `Target projection: ${aggregate.targetMinutes} minutes`,
    "",
    "## Preprocessing",
    "",
    `Model: ${aggregate.preprocessing.model || "unknown"}`,
    `Runs: ${aggregate.preprocessing.runs}`,
    "",
    "| Component | Avg input | Avg output | Avg total | Min total | Max total |",
    "|---|---:|---:|---:|---:|---:|",
    preprocessingRow("Profile PDF", aggregate.preprocessing.profile),
    preprocessingRow("Meeting Context", aggregate.preprocessing.meetingContext),
    preprocessingRow("Combined", aggregate.preprocessing.combined),
    "",
    "## Live Meeting",
    "",
    `Runs: ${aggregate.live.runs}`,
    `Valid runs: ${aggregate.live.validation.validRuns}/${aggregate.live.runs}`,
    `Sample minutes avg: ${round(aggregate.live.sampleMinutes.avg, 2)}`,
    "",
    "| Metric | Avg | Median | Min | Max |",
    "|---|---:|---:|---:|---:|",
    liveRow("Realtime input tokens", aggregate.live.coreUsage.realtimeInputTokens),
    liveRow("Realtime cached input tokens", aggregate.live.coreUsage.realtimeCachedInputTokens),
    liveRow("Realtime output tokens", aggregate.live.coreUsage.realtimeOutputTokens),
    liveRow("Audio input tokens", aggregate.live.coreUsage.audioInputTokens),
    liveRow("Text input tokens", aggregate.live.coreUsage.textInputTokens),
    liveRow("Text output tokens", aggregate.live.coreUsage.textOutputTokens),
    liveRow("Help clicks completed", aggregate.live.requests.helpClicksCompleted),
    liveRow("Keyword requests", aggregate.live.requests.keywordRequests),
    liveRow("Transcript turns", aggregate.live.requests.transcriptTurns),
    liveRow("Usage records", aggregate.live.requests.usageRecords),
    "",
    "## Projected 45 Minutes",
    "",
    "| Metric | Avg | Median | Min | Max |",
    "|---|---:|---:|---:|---:|",
    liveRow("Realtime input tokens", aggregate.live.projected45MinuteCoreUsage.realtimeInputTokens),
    liveRow("Realtime cached input tokens", aggregate.live.projected45MinuteCoreUsage.realtimeCachedInputTokens),
    liveRow("Realtime output tokens", aggregate.live.projected45MinuteCoreUsage.realtimeOutputTokens),
    liveRow("Audio input tokens", aggregate.live.projected45MinuteCoreUsage.audioInputTokens),
    liveRow("Text input tokens", aggregate.live.projected45MinuteCoreUsage.textInputTokens),
    liveRow("Text output tokens", aggregate.live.projected45MinuteCoreUsage.textOutputTokens),
    "",
    "## Raw Usage Keys",
    "",
    "| Key | Avg | Median | Min | Max |",
    "|---|---:|---:|---:|---:|",
    ...Object.entries(aggregate.live.allUsageKeys)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, summary]) => liveRow(key, summary))
  ];

  return `${lines.join("\n")}\n`;
}

function preprocessingRow(label: string, usage: Record<string, unknown>) {
  const input = readObject(usage.inputTokens);
  const output = readObject(usage.outputTokens);
  const total = readObject(usage.totalTokens);
  return `| ${label} | ${round(numberValue(input.avg) || 0)} | ${round(numberValue(output.avg) || 0)} | ${round(numberValue(total.avg) || 0)} | ${round(numberValue(total.min) || 0)} | ${round(numberValue(total.max) || 0)} |`;
}

function liveRow(label: string, summary: NumberSummary) {
  return `| ${label} | ${round(summary.avg)} | ${round(summary.median)} | ${round(summary.min)} | ${round(summary.max)} |`;
}

function round(value: number, digits = 0) {
  return Number(value.toFixed(digits));
}

function timestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");
}
