import { AppleLLMChatLanguageModel } from './ai-sdk';
import { generateStream } from './streaming';

import NativeAppleLLMSpec, {
  type AppleMessage,
  type AppleGenerationOptions,
} from './NativeAppleLLM';
import z from 'zod';
import type { LanguageModelV1StreamPart } from '@ai-sdk/provider';

export function apple(): AppleLLMChatLanguageModel {
  return new AppleLLMChatLanguageModel();
}

interface StructuredGenerationOptions<T> extends AppleGenerationOptions {
  schema: z.ZodType<T>;
}

interface GenerationOptions extends AppleGenerationOptions {
  schema?: undefined;
}

async function generateText<T>(
  messages: AppleMessage[],
  options: StructuredGenerationOptions<T>
): Promise<T>;

async function generateText(
  messages: AppleMessage[],
  options?: GenerationOptions
): Promise<string>;

async function generateText(
  messages: AppleMessage[],
  options: StructuredGenerationOptions<unknown> | GenerationOptions = {}
): Promise<unknown> {
  const schema = 'schema' in options ? options.schema : undefined;

  const generationOptions = {
    ...options,
    ...(schema instanceof z.ZodType ? { schema: z.toJSONSchema(schema) } : {}),
  };

  const response = await NativeAppleLLMSpec.generateText(
    messages,
    generationOptions
  );

  if (schema instanceof z.ZodType) {
    const parsed = schema.parse(JSON.parse(response));
    return parsed;
  }

  return response;
}

export const foundationModels = {
  isAvailable: NativeAppleLLMSpec.isAvailable,
  generateText,
  generateStream(
    messages: AppleMessage[],
    options: AppleGenerationOptions = {}
  ): ReadableStream<LanguageModelV1StreamPart> {
    if (options.schema instanceof z.ZodObject) {
      options.schema = z.toJSONSchema(options.schema);
    }
    return generateStream(messages, options);
  },
};
