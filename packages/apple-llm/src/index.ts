import { type LanguageModelV1StreamPart } from '@ai-sdk/provider'
import { type Tool } from 'ai'
import { z } from 'zod'

import { AppleLLMChatLanguageModel } from './ai-sdk'
import NativeAppleLLMSpec, {
  type AppleGenerationOptions,
  type AppleMessage,
} from './NativeAppleLLM'
import { generateStream } from './streaming'
import { registerTools } from './tools'

export function apple(): AppleLLMChatLanguageModel {
  return new AppleLLMChatLanguageModel()
}

interface StructuredGenerationOptions<T extends z.ZodObject<any, any>>
  extends AppleGenerationOptions {
  schema: T
  tools?: Record<string, Tool>
}

interface GenerationOptions extends AppleGenerationOptions {
  schema?: undefined
  tools?: Record<string, Tool>
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
    ...(options.tools
      ? {
          tools: Object.fromEntries(
            Object.entries(options.tools).map(([name, tool]) => [
              name,
              {
                name,
                description: tool.description,
                parameters: z.toJSONSchema(tool.parameters),
              },
            ])
          ),
        }
      : {}),
  }

  // TODO: This is not concurrent-safe at the moment, we should also clean-up later
  // TODO: Wrap execute to parse back the arguments to correct types
  if (options.tools) {
    registerTools(options.tools)
  }

  const response = await NativeAppleLLMSpec.generateText(
    messages,
    generationOptions
  )

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
