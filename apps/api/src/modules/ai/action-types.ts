import type { z } from "zod";

export type AiActionStatus = "success" | "partial" | "insufficient_input" | "needs_human_review" | "failed_policy";
export type AiConfidence = "low" | "medium" | "high";

export type ActionSpec<TInput> = {
  actionId: string;
  promptActionId?: string;
  version: string;
  goal: string;
  role: string;
  task: string;
  policyRules: string[];
  outputSchemaDescription: string;
  buildContext: (input: TInput) => string;
};

export type PromptBuildResult = {
  actionId: string;
  promptVersion: string;
  systemInstructions: string;
  runtimeContext: string;
  assembledPrompt: string;
  debugMetadata: {
    actionId: string;
    promptVersion: string;
    contextCharacters: number;
    truncated: boolean;
  };
};

export type ActionExecutionResult<TOutput> = {
  output: TOutput;
  metadata: {
    actionId: string;
    promptVersion: string;
    model: string;
    validationStatus: "valid";
  };
};

export type ParsedActionResult<TSchema extends z.ZodTypeAny> = z.infer<TSchema>;
