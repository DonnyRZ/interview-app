import { readFile } from "node:fs/promises";
import { env } from "../../env.js";
import type { PromptBuildResult } from "./action-types.js";

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

export async function generateOpenAiJson(prompt: PromptBuildResult, inlineFile?: InlineFilePart) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const content: unknown[] = [];
  if (inlineFile) {
    if (inlineFile.mimeType !== "application/pdf") {
      throw new Error(`OpenAI CV preprocessing currently supports PDF inline files only. Received ${inlineFile.mimeType}`);
    }

    const bytes = await readFile(inlineFile.filePath);
    content.push({
      type: "input_file",
      filename: inlineFile.filePath.split(/[\\/]/).pop() || "cv.pdf",
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

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_TEXT_MODEL,
      instructions: prompt.systemInstructions,
      input: [
        {
          role: "user",
          content
        }
      ]
    })
  });

  const payload = await response.json() as OpenAiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI request failed with ${response.status}`);
  }

  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("OpenAI returned an empty response");
  }

  return parseJsonText(text);
}

export async function createOpenAiRealtimeClientSecret(instructions: string) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (env.OPENAI_REALTIME_MODEL !== "gpt-realtime-mini") {
    throw new Error("Live interview runtime only supports gpt-realtime-mini.");
  }

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      expires_after: {
        anchor: "created_at",
        seconds: 600
      },
      session: {
        type: "realtime",
        model: env.OPENAI_REALTIME_MODEL,
        instructions,
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
              model: "gpt-4o-mini-transcribe"
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

  const payload = await response.json() as OpenAiRealtimeClientSecretResponse;
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
