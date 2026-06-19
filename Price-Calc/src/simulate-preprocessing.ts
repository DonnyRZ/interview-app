import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { config } from "dotenv";
import postgres from "postgres";
import { buildPrompt } from "../../apps/api/src/modules/ai/prompt-builder.js";
import { preprocessMeetingContextSpec } from "../../apps/api/src/modules/ai/actions/preprocessing/preprocess-meeting-context.js";
import { preprocessProfileDocumentSpec } from "../../apps/api/src/modules/ai/actions/preprocessing/preprocess-user-profile.js";
import {
  preprocessMeetingContextResultSchema,
  preprocessProfileDocumentResultSchema
} from "../../apps/api/src/modules/ai/action-schemas.js";

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: Record<string, unknown>;
  output_tokens_details?: Record<string, unknown>;
};

type OpenAiResponsePayload = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: Usage;
  error?: {
    message?: string;
  };
};

type ProfileDocumentRow = {
  id: string;
  file_name: string;
  file_path: string;
  file_mime_type: string | null;
};

type MeetingContextRow = {
  id: string;
  context_name: string;
  meeting_topic: string;
  meeting_brief: string | null;
};

type ActionRunResult = {
  rawPayload: OpenAiResponsePayload;
  parsedOutput: unknown;
  usage: Usage;
  promptDebug: {
    actionId: string;
    promptVersion: string;
    contextCharacters: number;
    truncated: boolean;
    systemInstructionCharacters: number;
    assembledPromptCharacters: number;
  };
};

const envPath = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env")
].find((candidate) => existsSync(candidate));

config(envPath ? { path: envPath, override: true } : { override: true });

const runs = Number(readArg("--runs") || "5");
const model = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/orviko_dev";
const outputRoot = path.resolve(readArg("--output-dir") || path.join("Price-Calc", "outputs", `preprocessing-simulation-${timestamp()}`));
const profileDocumentId = readArg("--profile-document-id");
const profileFileName = readArg("--profile-file-name");
const meetingContextId = readArg("--meeting-context-id");
const meetingContextName = readArg("--meeting-context-name");
const meetingTopic = readArg("--meeting-topic");

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not configured.");
}

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });

try {
  await mkdir(outputRoot, { recursive: true });

  const profileDocument = await loadProfileDocument();
  const meetingContext = await loadMeetingContext();

  const results = [];
  for (let index = 1; index <= runs; index += 1) {
    const runOutputPath = path.join(outputRoot, `run-${String(index).padStart(2, "0")}.json`);
    if (existsSync(runOutputPath)) {
      console.log(`[run ${index}/${runs}] existing result found, loading...`);
      results.push(JSON.parse(await readFile(runOutputPath, "utf8")));
      continue;
    }

    console.log(`[run ${index}/${runs}] profile preprocessing...`);
    const profileRun = await runProfilePreprocessing(profileDocument);
    const profileOutput = preprocessProfileDocumentResultSchema.safeParse(profileRun.parsedOutput);
    const profileReadyContext = profileOutput.success
      ? profileOutput.data.result.readyContext
      : readNestedString(profileRun.parsedOutput, ["result", "readyContext"]);

    console.log(`[run ${index}/${runs}] meeting context preprocessing...`);
    const meetingRun = await runMeetingContextPreprocessing(meetingContext, profileReadyContext);
    const meetingOutput = preprocessMeetingContextResultSchema.safeParse(meetingRun.parsedOutput);

    const runResult = {
      run: index,
      model,
      profile: sanitizeActionRun(profileRun, {
        schemaValid: profileOutput.success,
        schemaIssues: profileOutput.success ? [] : profileOutput.error.issues,
        outputStatus: profileOutput.success ? profileOutput.data.status : readNestedString(profileRun.parsedOutput, ["status"]) || "schema_invalid",
        outputConfidence: profileOutput.success ? profileOutput.data.confidence : readNestedString(profileRun.parsedOutput, ["confidence"]) || "unknown",
        readyContextCharacters: profileReadyContext.length
      }),
      meetingContext: sanitizeActionRun(meetingRun, {
        schemaValid: meetingOutput.success,
        schemaIssues: meetingOutput.success ? [] : meetingOutput.error.issues,
        outputStatus: meetingOutput.success ? meetingOutput.data.status : readNestedString(meetingRun.parsedOutput, ["status"]) || "schema_invalid",
        outputConfidence: meetingOutput.success ? meetingOutput.data.confidence : readNestedString(meetingRun.parsedOutput, ["confidence"]) || "unknown",
        contextTextCharacters: meetingOutput.success
          ? meetingOutput.data.result.contextText.length
          : readNestedString(meetingRun.parsedOutput, ["result", "contextText"]).length
      }),
      combinedUsage: combineUsage(profileRun.usage, meetingRun.usage)
    };

    results.push(runResult);
    await writeJson(runOutputPath, runResult);
  }

  const summary = buildSummary({
    outputRoot,
    runs,
    model,
    database: redactDatabaseUrl(databaseUrl),
    source: {
      profileDocument: {
        id: redactId(profileDocument.id),
        fileName: profileDocument.file_name,
        fileMimeType: profileDocument.file_mime_type,
        filePath: profileDocument.file_path,
        fileSizeBytes: (await readFile(profileDocument.file_path)).byteLength
      },
      meetingContext: {
        id: redactId(meetingContext.id),
        contextName: meetingContext.context_name,
        meetingTopic: meetingContext.meeting_topic,
        meetingBriefCharacters: meetingContext.meeting_brief?.length || 0
      }
    },
    results
  });

  await writeJson(path.join(outputRoot, "summary.json"), summary);
  await writeFile(path.join(outputRoot, "summary.md"), renderSummaryMarkdown(summary), "utf8");
  console.log(JSON.stringify({ outputRoot, summary: summary.totals }, null, 2));
} finally {
  await sql.end({ timeout: 1 });
}

async function loadProfileDocument(): Promise<ProfileDocumentRow> {
  if (profileDocumentId) {
    const [row] = await sql`
      select id, file_name, file_path, file_mime_type
      from profile_documents
      where id = ${profileDocumentId} and processing_status = 'ready'
      limit 1
    `;

    return validateProfileDocumentRow(row, `No ready profile document found for id ${profileDocumentId}.`);
  }

  if (profileFileName) {
    const [row] = await sql`
      select id, file_name, file_path, file_mime_type
      from profile_documents
      where file_name = ${profileFileName} and processing_status = 'ready'
      order by created_at desc
      limit 1
    `;

    return validateProfileDocumentRow(row, `No ready profile document found for file name ${profileFileName}.`);
  }

  const [row] = await sql.unsafe(`
    select id, file_name, file_path, file_mime_type
    from profile_documents
    where is_active = true and processing_status = 'ready'
    order by created_at desc
    limit 1
  `);

  return validateProfileDocumentRow(row, "No active ready profile document found in DB.");
}

function validateProfileDocumentRow(row: unknown, missingMessage: string): ProfileDocumentRow {
  if (!row) {
    throw new Error(missingMessage);
  }
  const profileDocument = row as ProfileDocumentRow;
  if (!existsSync(profileDocument.file_path)) {
    throw new Error(`Profile document file is missing: ${profileDocument.file_path}`);
  }

  return profileDocument;
}

async function loadMeetingContext(): Promise<MeetingContextRow> {
  if (meetingContextId) {
    const [row] = await sql`
      select id, context_name, meeting_topic, meeting_brief
      from meeting_contexts
      where id = ${meetingContextId} and status = 'active'
      limit 1
    `;

    return validateMeetingContextRow(row, `No active meeting context found for id ${meetingContextId}.`);
  }

  if (meetingContextName || meetingTopic) {
    const [row] = meetingContextName && meetingTopic
      ? await sql`
        select id, context_name, meeting_topic, meeting_brief
        from meeting_contexts
        where context_name = ${meetingContextName} and meeting_topic = ${meetingTopic} and status = 'active'
        order by created_at desc
        limit 1
      `
      : meetingContextName
        ? await sql`
          select id, context_name, meeting_topic, meeting_brief
          from meeting_contexts
          where context_name = ${meetingContextName} and status = 'active'
          order by created_at desc
          limit 1
        `
        : await sql`
          select id, context_name, meeting_topic, meeting_brief
          from meeting_contexts
          where meeting_topic = ${meetingTopic} and status = 'active'
          order by created_at desc
          limit 1
        `;

    return validateMeetingContextRow(row, "No active meeting context found for the requested name/topic.");
  }

  const [row] = await sql.unsafe(`
    select id, context_name, meeting_topic, meeting_brief
    from meeting_contexts
    where status = 'active'
    order by created_at desc
    limit 1
  `);

  return validateMeetingContextRow(row, "No active meeting context found in DB.");
}

function validateMeetingContextRow(row: unknown, missingMessage: string): MeetingContextRow {
  if (!row) {
    throw new Error(missingMessage);
  }

  return row as MeetingContextRow;
}

async function runProfilePreprocessing(profileDocument: ProfileDocumentRow): Promise<ActionRunResult> {
  const prompt = buildPrompt(preprocessProfileDocumentSpec, {
    fileName: profileDocument.file_name,
    fileMimeType: profileDocument.file_mime_type
  });
  const bytes = await readFile(profileDocument.file_path);
  const content = [
    {
      type: "input_file",
      filename: path.basename(profileDocument.file_path),
      file_data: `data:${profileDocument.file_mime_type || "application/pdf"};base64,${bytes.toString("base64")}`
    },
    {
      type: "input_text",
      text: `${prompt.assembledPrompt}\n\nPenting: balas hanya JSON valid tanpa markdown fence, tanpa komentar, dan tanpa teks tambahan.`
    }
  ];

  return runResponsesJson(prompt, content);
}

async function runMeetingContextPreprocessing(
  meetingContext: MeetingContextRow,
  profileDocumentReadyContext: string
): Promise<ActionRunResult> {
  const prompt = buildPrompt(preprocessMeetingContextSpec, {
    contextName: meetingContext.context_name,
    meetingTopic: meetingContext.meeting_topic,
    meetingBrief: meetingContext.meeting_brief || undefined,
    profileDocumentReadyContext
  });
  const content = [
    {
      type: "input_text",
      text: `${prompt.assembledPrompt}\n\nPenting: balas hanya JSON valid tanpa markdown fence, tanpa komentar, dan tanpa teks tambahan.`
    }
  ];

  return runResponsesJson(prompt, content);
}

async function runResponsesJson(prompt: ReturnType<typeof buildPrompt>, content: unknown[]): Promise<ActionRunResult> {
  const body = JSON.stringify({
    model,
    instructions: prompt.systemInstructions,
    input: [
      {
        role: "user",
        content
      }
    ]
  });

  const rawPayload = await fetchWithRetry(body);

  const text = extractResponseText(rawPayload);
  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return {
    rawPayload,
    parsedOutput: parseJsonText(text),
    usage: rawPayload.usage || {},
    promptDebug: {
      ...prompt.debugMetadata,
      systemInstructionCharacters: prompt.systemInstructions.length,
      assembledPromptCharacters: prompt.assembledPrompt.length
    }
  };
}

async function fetchWithRetry(body: string): Promise<OpenAiResponsePayload> {
  const maxAttempts = 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body
      });

      const rawPayload = await response.json() as OpenAiResponsePayload;
      if (!response.ok) {
        throw new Error(rawPayload.error?.message || `OpenAI request failed with ${response.status}`);
      }

      return rawPayload;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }

      const waitMs = 1500 * attempt;
      console.warn(`[retry] OpenAI request attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}. Waiting ${waitMs}ms.`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sanitizeActionRun(run: ActionRunResult, extra: Record<string, unknown>) {
  return {
    responseId: run.rawPayload.id,
    responseModel: run.rawPayload.model,
    usage: run.usage,
    promptDebug: run.promptDebug,
    ...extra
  };
}

function readNestedString(source: unknown, pathParts: string[]) {
  let current: unknown = source;
  for (const pathPart of pathParts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return "";
    }
    current = (current as Record<string, unknown>)[pathPart];
  }

  return typeof current === "string" ? current : "";
}

function combineUsage(left: Usage, right: Usage): Usage {
  return {
    input_tokens: numberFrom(left.input_tokens) + numberFrom(right.input_tokens),
    output_tokens: numberFrom(left.output_tokens) + numberFrom(right.output_tokens),
    total_tokens: numberFrom(left.total_tokens) + numberFrom(right.total_tokens)
  };
}

function buildSummary(input: {
  outputRoot: string;
  runs: number;
  model: string;
  database: string;
  source: unknown;
  results: Array<{
    run: number;
    profile: { usage: Usage };
    meetingContext: { usage: Usage };
    combinedUsage: Usage;
  }>;
}) {
  const profileUsages = input.results.map((item) => item.profile.usage);
  const meetingUsages = input.results.map((item) => item.meetingContext.usage);
  const combinedUsages = input.results.map((item) => item.combinedUsage);

  return {
    generatedAt: new Date().toISOString(),
    outputRoot: input.outputRoot,
    model: input.model,
    database: input.database,
    source: input.source,
    runs: input.results,
    totals: {
      profile: summarizeUsages(profileUsages),
      meetingContext: summarizeUsages(meetingUsages),
      combined: summarizeUsages(combinedUsages)
    }
  };
}

function summarizeUsages(usages: Usage[]) {
  return {
    inputTokens: summarizeNumbers(usages.map((usage) => usage.input_tokens)),
    outputTokens: summarizeNumbers(usages.map((usage) => usage.output_tokens)),
    totalTokens: summarizeNumbers(usages.map((usage) => usage.total_tokens))
  };
}

function summarizeNumbers(values: Array<number | undefined>) {
  const numeric = values.map(numberFrom);
  return {
    min: Math.min(...numeric),
    avg: numeric.reduce((sum, value) => sum + value, 0) / numeric.length,
    max: Math.max(...numeric),
    values: numeric
  };
}

function renderSummaryMarkdown(summary: ReturnType<typeof buildSummary>) {
  const lines = [
    "# Orviko Preprocessing Simulation",
    "",
    `Generated at: ${summary.generatedAt}`,
    `Model: ${summary.model}`,
    `Runs: ${summary.runs.length}`,
    "",
    "## Average Usage",
    "",
    "| Component | Avg input tokens | Avg output tokens | Avg total tokens |",
    "|---|---:|---:|---:|",
    tableUsageRow("User Profile preprocessing", summary.totals.profile),
    tableUsageRow("Meeting Context preprocessing", summary.totals.meetingContext),
    tableUsageRow("Profile + Meeting Context", summary.totals.combined),
    "",
    "## Run Detail",
    "",
    "| Run | Profile input | Profile output | Meeting input | Meeting output | Combined input | Combined output | Combined total |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...summary.runs.map((run) => [
      run.run,
      numberFrom(run.profile.usage.input_tokens),
      numberFrom(run.profile.usage.output_tokens),
      numberFrom(run.meetingContext.usage.input_tokens),
      numberFrom(run.meetingContext.usage.output_tokens),
      numberFrom(run.combinedUsage.input_tokens),
      numberFrom(run.combinedUsage.output_tokens),
      numberFrom(run.combinedUsage.total_tokens)
    ].join(" | ")).map((line) => `| ${line} |`)
  ];

  return `${lines.join("\n")}\n`;
}

function tableUsageRow(label: string, usage: ReturnType<typeof summarizeUsages>) {
  return `| ${label} | ${round(usage.inputTokens.avg)} | ${round(usage.outputTokens.avg)} | ${round(usage.totalTokens.avg)} |`;
}

function extractResponseText(payload: OpenAiResponsePayload) {
  if (payload.output_text?.trim()) {
    return payload.output_text.trim();
  }

  return payload.output
    ?.flatMap((item) => item.content || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}

function parseJsonText(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      return JSON.parse(fenced);
    }

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }

    throw new Error("OpenAI response is not valid JSON.");
  }
}

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round(value: number) {
  return Math.round(value);
}

async function writeJson(filePath: string, data: unknown) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function timestamp() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function readArg(name: string) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function redactDatabaseUrl(value: string) {
  return value.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

function redactId(value: string) {
  return `${value.slice(0, 8)}...`;
}
