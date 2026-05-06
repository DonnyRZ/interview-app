import type { z } from "zod";
import { env } from "../../env.js";
import { buildPrompt } from "./prompt-builder.js";
import { generateOpenAiJson } from "./openai.client.js";
import type { ActionExecutionResult, ActionSpec } from "./action-types.js";

type RunJsonActionInput<TInput, TSchema extends z.ZodTypeAny> = {
  spec: ActionSpec<TInput>;
  input: TInput;
  outputSchema: TSchema;
  inlineFile?: {
    filePath: string;
    mimeType: string;
  };
};

export async function runOpenAiJsonAction<TInput, TSchema extends z.ZodTypeAny>({
  spec,
  input,
  outputSchema,
  inlineFile
}: RunJsonActionInput<TInput, TSchema>): Promise<ActionExecutionResult<z.infer<TSchema>>> {
  const prompt = buildPrompt(spec, input);
  const rawOutput = await generateOpenAiJson(prompt, inlineFile);
  const output = outputSchema.parse(rawOutput);

  return {
    output,
    metadata: {
      actionId: prompt.actionId,
      promptVersion: prompt.promptVersion,
      model: env.OPENAI_TEXT_MODEL,
      validationStatus: "valid"
    }
  };
}
