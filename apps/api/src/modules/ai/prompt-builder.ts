import type { ActionSpec, PromptBuildResult } from "./action-types.js";

const MAX_CONTEXT_CHARACTERS = 24_000;

export function buildPrompt<TInput>(spec: ActionSpec<TInput>, input: TInput): PromptBuildResult {
  const rawContext = spec.buildContext(input);
  const truncated = rawContext.length > MAX_CONTEXT_CHARACTERS;
  const runtimeContext = truncated
    ? `${rawContext.slice(0, MAX_CONTEXT_CHARACTERS)}\n\n[Context truncated by prompt builder.]`
    : rawContext;

  const systemInstructions = [
    `Peran:\n${spec.role}`,
    `Tujuan bisnis:\n${spec.goal}`,
    `Kebijakan operasional:\n${spec.policyRules.map((rule) => `- ${rule}`).join("\n")}`
  ].join("\n\n");

  const assembledPrompt = [
    `Action ID: ${spec.actionId}`,
    `Versi prompt: ${spec.version}`,
    `Tugas:\n${spec.task}`,
    `Konteks:\n${runtimeContext}`,
    `Kontrak output:\n${spec.outputSchemaDescription}`
  ].join("\n\n");

  return {
    actionId: spec.actionId,
    promptVersion: spec.version,
    systemInstructions,
    runtimeContext,
    assembledPrompt,
    debugMetadata: {
      actionId: spec.actionId,
      promptVersion: spec.version,
      contextCharacters: rawContext.length,
      truncated
    }
  };
}
