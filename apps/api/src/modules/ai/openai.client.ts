import { readFile } from "node:fs/promises";
import { env } from "../../env.js";
import type { PromptBuildResult } from "./action-types.js";
import {
  buildSafetyIdentifier,
  recordUsageEvent,
  type UsageCapability
} from "../usage/usage.service.js";

type InlineFilePart = {
  filePath: string;
  mimeType: string;
};

type OpenAiResponseContent = {
  type?: string;
  text?: string;
};

type OpenAiResponseOutput = {
  type?: string;
  content?: OpenAiResponseContent[];
};

type OpenAiResponse = {
  output_text?: string;
  output?: OpenAiResponseOutput[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type OpenAiRealtimeClientSecretResponse = {
  value?: string;
  expires_at?: number;
  session?: {
    client_secret?: {
      value?: string;
      expires_at?: number;
    };
  };
  error?: {
    message?: string;
  };
};

type RealtimeClientSecretConfig = {
  instructions: string;
  transcriptionPrompt: string;
  userId: string;
  liveMeetingSessionId: string;
};

type OpenAiUsageContext = {
  userId?: string;
  capability?: UsageCapability;
};

export async function generateOpenAiJson(
  prompt: PromptBuildResult,
  inlineFile?: InlineFilePart,
  usageContext: OpenAiUsageContext = {}
) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (env.OPENAI_KILL_SWITCH) {
    if (usageContext.userId && usageContext.capability) {
      await recordUsageEvent({
        userId: usageContext.userId,
        capability: usageContext.capability,
        provider: "openai",
        model: env.OPENAI_TEXT_MODEL,
        requestStatus: "blocked",
        metadata: {
          actionId: prompt.actionId,
          reason: "OPENAI_KILL_SWITCH"
        }
      });
    }
    throw new Error("OpenAI requests are temporarily disabled.");
  }

  const content: unknown[] = [];
  if (inlineFile) {
    if (inlineFile.mimeType !== "application/pdf") {
      throw new Error(`OpenAI profile document preprocessing currently supports PDF inline files only. Received ${inlineFile.mimeType}`);
    }

    const bytes = await readFile(inlineFile.filePath);
    content.push({
      type: "input_file",
      filename: inlineFile.filePath.split(/[\\/]/).pop() || "profile.pdf",
      file_data: `data:${inlineFile.mimeType};base64,${bytes.toString("base64")}`
    });
  }

  content.push({
    type: "input_text",
    text: [
      prompt.assembledPrompt,
      "",
      "Penting: balas hanya JSON valid tanpa markdown fence, tanpa komentar, dan tanpa teks tambahan."
    ].join("\n")
  });

  const startedAt = Date.now();
  let payload: OpenAiResponse | undefined;
  let responseOk = false;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_TEXT_MODEL,
        store: false,
        safety_identifier: usageContext.userId ? buildSafetyIdentifier(usageContext.userId) : undefined,
        instructions: prompt.systemInstructions,
        input: [
          {
            role: "user",
            content
          }
        ]
      })
    });

    payload = await response.json() as OpenAiResponse;
    responseOk = response.ok;
    if (!response.ok) {
      throw new Error(payload.error?.message || `OpenAI request failed with ${response.status}`);
    }

    const text = extractResponseText(payload);
    if (!text) {
      throw new Error("OpenAI returned an empty response");
    }

    return parseJsonText(text);
  } finally {
    if (usageContext.userId && usageContext.capability) {
      await recordUsageEvent({
        userId: usageContext.userId,
        capability: usageContext.capability,
        provider: "openai",
        model: env.OPENAI_TEXT_MODEL,
        inputTokens: payload?.usage?.input_tokens,
        outputTokens: payload?.usage?.output_tokens,
        totalTokens: payload?.usage?.total_tokens,
        durationMs: Date.now() - startedAt,
        requestStatus: responseOk ? "success" : "failed",
        metadata: {
          actionId: prompt.actionId,
          promptVersion: prompt.promptVersion
        }
      });
    }
  }
}

export async function createOpenAiRealtimeClientSecret(config: RealtimeClientSecretConfig) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (env.OPENAI_KILL_SWITCH) {
    await recordUsageEvent({
      userId: config.userId,
      liveMeetingSessionId: config.liveMeetingSessionId,
      capability: "realtime_client_secret",
      provider: "openai",
      model: env.OPENAI_REALTIME_MODEL,
      requestStatus: "blocked",
      metadata: {
        reason: "OPENAI_KILL_SWITCH"
      }
    });
    throw new Error("OpenAI requests are temporarily disabled.");
  }

  if (env.OPENAI_REALTIME_MODEL !== "gpt-realtime-mini") {
    throw new Error("Live meeting runtime only supports gpt-realtime-mini.");
  }

  const startedAt = Date.now();
  let payload: OpenAiRealtimeClientSecretResponse | undefined;
  let responseOk = false;
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        safety_identifier: buildSafetyIdentifier(config.userId),
        expires_after: {
          anchor: "created_at",
          seconds: 600
        },
        session: {
          type: "realtime",
          model: env.OPENAI_REALTIME_MODEL,
          instructions: config.instructions,
          output_modalities: ["text"],
          audio: {
            input: {
              format: {
                type: "audio/pcm",
                rate: 24000
              },
              noise_reduction: {
                type: "near_field"
              },
              transcription: {
                model: "gpt-4o-mini-transcribe",
                language: "id",
                prompt: config.transcriptionPrompt
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
                create_response: false,
                interrupt_response: false
              }
            }
          },
          max_output_tokens: 500
        }
      })
    });

    payload = await response.json() as OpenAiRealtimeClientSecretResponse;
    responseOk = response.ok;
    if (!response.ok) {
      throw new Error(payload.error?.message || `OpenAI realtime client secret request failed with ${response.status}`);
    }

    const clientSecret = payload.value || payload.session?.client_secret?.value;
    const expiresAt = payload.expires_at || payload.session?.client_secret?.expires_at;
    if (!clientSecret || !expiresAt) {
      throw new Error("OpenAI realtime client secret response is incomplete");
    }

    return {
      model: env.OPENAI_REALTIME_MODEL,
      clientSecret,
      expiresAt
    };
  } finally {
    await recordUsageEvent({
      userId: config.userId,
      liveMeetingSessionId: config.liveMeetingSessionId,
      capability: "realtime_client_secret",
      provider: "openai",
      model: env.OPENAI_REALTIME_MODEL,
      durationMs: Date.now() - startedAt,
      requestStatus: responseOk ? "success" : "failed",
      metadata: {
        expiresAt: payload?.expires_at || payload?.session?.client_secret?.expires_at || null
      }
    });
  }
}

function extractResponseText(payload: OpenAiResponse) {
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

    throw new Error("OpenAI response is not valid JSON");
  }
}
