import { type LanguageModelV1StreamPart } from '@ai-sdk/provider'
import z from 'zod'

import { AppleLLMChatLanguageModel } from './ai-sdk'
import NativeAppleLLMSpec, {
  type AppleGenerationOptions,
  type AppleMessage,
} from './NativeAppleLLM'
import { generateStream } from './streaming'

export function apple(): AppleLLMChatLanguageModel {
  return new AppleLLMChatLanguageModel()
}

interface StructuredGenerationOptions<T extends z.ZodObject<any, any>>
  extends AppleGenerationOptions {
  schema: T
}

interface GenerationOptions extends AppleGenerationOptions {
  schema?: undefined
}

async function generateText<T extends z.ZodObject<any, any>>(
  messages: AppleMessage[],
  options: StructuredGenerationOptions<T>
): Promise<z.infer<T>>

async function generateText(
  messages: AppleMessage[],
  options?: GenerationOptions
): Promise<string>

async function generateText(
  messages: AppleMessage[],
  options: StructuredGenerationOptions<any> | GenerationOptions = {}
): Promise<unknown> {
  const schema = 'schema' in options ? options.schema : undefined

  const generationOptions = {
    ...options,
    ...(schema ? { schema: z.toJSONSchema(schema) } : {}),
  }

  const response = await NativeAppleLLMSpec.generateText(
    messages,
    generationOptions
  )

  if (schema) {
    const parsed = schema.parse(JSON.parse(response))
    return parsed
  }

  return response
}

export const foundationModels = {
  isAvailable: NativeAppleLLMSpec.isAvailable,
  generateText,
  generateStream(
    messages: AppleMessage[],
    options: AppleGenerationOptions = {}
  ): ReadableStream<LanguageModelV1StreamPart> {
    if (options.schema instanceof z.ZodObject) {
      options.schema = z.toJSONSchema(options.schema)
    }
    return generateStream(messages, options)
  },
}
