import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2FunctionTool,
  LanguageModelV2Prompt,
  LanguageModelV2ProviderDefinedTool,
  ProviderV2,
} from '@ai-sdk/provider'
import { generateId, ToolSet } from 'ai'

import NativeAppleLLM, { type AppleMessage } from './NativeAppleLLM'
import { generateStream } from './stream'

type Tool = LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool

interface AppleProvider extends ProviderV2 {
  (): LanguageModelV2
  isAvailable: () => boolean
}

export function createAppleProvider(tools: ToolSet): AppleProvider {
  const createLanguageModel = () => {
    return new AppleLLMChatLanguageModel(tools)
  }
  const provider = function () {
    return createLanguageModel()
  }
  provider.isAvailable = () => NativeAppleLLM.isAvailable()
  provider.languageModel = createLanguageModel
  provider.textEmbeddingModel = () => {
    throw new Error('Text embedding models are not supported by Apple LLM')
  }
  provider.imageModel = () => {
    throw new Error('Image generation models are not supported by Apple LLM')
  }
  return provider
}

export const apple = createAppleProvider({})

class AppleLLMChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2'
  readonly supportedUrls = {}

  readonly provider = 'apple-llm'
  readonly modelId = 'system-default'

  private tools: ToolSet

  constructor(tools: ToolSet) {
    this.tools = tools
  }

  private prepareMessages(messages: LanguageModelV2Prompt): AppleMessage[] {
    return messages.map((message): AppleMessage => {
      const content = Array.isArray(message.content)
        ? message.content.reduce((acc, part) => {
            if (part.type === 'text') {
              return acc + part.text
            }
            console.warn('Unsupported message content type:', part)
            return acc
          }, '')
        : message.content

      return {
        role: message.role,
        content,
      }
    })
  }

  private prepareTools(tools: Tool[]) {
    return tools.map((tool) => {
      if (tool.type === 'function') {
        return {
          ...this.tools[tool.name],
          ...tool,
          id: generateId(),
        }
      }
      throw new Error('Unsupported tool type')
    })
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const messages = this.prepareMessages(options.prompt)
    const tools = this.prepareTools(options.tools)

    for (const tool of tools) {
      globalThis.__APPLE_LLM_TOOLS__[tool.id] = tool.execute
    }

    const response = await NativeAppleLLM.generateText(messages, {
      maxTokens: options.maxOutputTokens,
      temperature: options.temperature,
      topP: options.topP,
      topK: options.topK,
      tools,
      schema:
        options.responseFormat?.type === 'json'
          ? options.responseFormat.schema
          : undefined,
    })

    for (const tool of tools) {
      globalThis.__APPLE_LLM_TOOLS__[tool.id] = undefined
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response),
        },
      ],
      finishReason: 'stop' as const,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      warnings: [],
    }
  }

  async doStream(options: LanguageModelV2CallOptions) {
    const messages = this.prepareMessages(options.prompt)

    const stream = generateStream(messages, {
      maxTokens: options.maxOutputTokens,
      temperature: options.temperature,
      topP: options.topP,
      topK: options.topK,
    })

    return {
      stream,
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: {},
      },
    }
  }
}

declare global {
  var __APPLE_LLM_TOOLS__: Record<string, Function>
}

globalThis.__APPLE_LLM_TOOLS__ = {}
