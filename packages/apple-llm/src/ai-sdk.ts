import type {
  EmbeddingModelV2,
  JSONValue,
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2FunctionTool,
  LanguageModelV2Prompt,
  LanguageModelV2ProviderDefinedTool,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider'
import {
  generateId,
  jsonSchema,
  parseJSON,
  type Tool as ToolDefinition,
  ToolCallOptions,
} from '@ai-sdk/provider-utils'

import NativeAppleEmbeddings from './NativeAppleEmbeddings'
import NativeAppleLLM, { type AppleMessage } from './NativeAppleLLM'

type Tool = LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool
type ToolSet = Record<string, ToolDefinition>

export function createAppleProvider({
  availableTools,
}: {
  availableTools?: ToolSet
} = {}) {
  if (typeof structuredClone === 'undefined') {
    throw new Error(
      'structuredClone is not available in this environment. Please load a polyfill, such as @ungap/structured-clone.'
    )
  }
  const createLanguageModel = () => {
    return new AppleLLMChatLanguageModel(availableTools)
  }
  const provider = function () {
    return createLanguageModel()
  }
  provider.isAvailable = () => NativeAppleLLM.isAvailable()
  provider.languageModel = createLanguageModel
  provider.textEmbeddingModel = (modelId: string = 'NLContextualEmbedding') => {
    if (modelId !== 'NLContextualEmbedding') {
      throw new Error('Only the default model is supported')
    }
    return new AppleTextEmbeddingModel()
  }
  provider.imageModel = () => {
    throw new Error('Image generation models are not supported by Apple LLM')
  }
  return provider
}

export const apple = createAppleProvider()

class AppleTextEmbeddingModel implements EmbeddingModelV2<string> {
  readonly specificationVersion = 'v2'
  readonly provider = 'apple'

  readonly modelId: string = 'NLContextualEmbedding'
  readonly maxEmbeddingsPerCall = Infinity
  readonly supportsParallelCalls = false

  async doEmbed(options: {
    values: string[]
    providerOptions?: Record<string, JSONValue>
  }) {
    const language = String(options.providerOptions?.language ?? 'en')
    await NativeAppleEmbeddings.prepare(language)
    const embeddings = await NativeAppleEmbeddings.generateEmbeddings(
      options.values,
      language
    )
    return {
      embeddings,
    }
  }
}

class AppleLLMChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2'
  readonly supportedUrls = {}

  readonly provider = 'apple'
  readonly modelId = 'system-default'

  private tools: ToolSet

  constructor(tools: ToolSet = {}) {
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

  private prepareTools(tools: Tool[] = []) {
    return tools.map((tool) => {
      if (tool.type === 'function') {
        const toolDefinition = this.tools[tool.name]
        if (!toolDefinition) {
          throw new Error(`Tool ${tool.name} not found`)
        }
        const schema = jsonSchema(tool.inputSchema)
        return {
          ...tool,
          id: generateId(),
          execute: async (modelInput: any, opts: ToolCallOptions) => {
            const toolCallArguments = await parseJSON({
              text: modelInput,
              schema,
            })
            return toolDefinition.execute(toolCallArguments, opts)
          },
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
      content: response.map((part) => {
        switch (part.type) {
          case 'text':
            return part
          case 'tool-call':
            return {
              type: 'tool-call' as const,
              toolCallId: '',
              providerExecuted: true,
              toolName: part.toolName,
              input: part.input,
            }
          case 'tool-result':
            return {
              type: 'tool-result' as const,
              toolCallId: '',
              providerExecuted: true,
              toolName: part.toolName,
              result: part.output,
            }
        }
      }),
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
    const tools = this.prepareTools(options.tools)

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        `ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.`
      )
    }

    const schema =
      options.responseFormat?.type === 'json'
        ? options.responseFormat.schema
        : undefined

    if (schema) {
      throw new Error('Streaming JSON responses is not yet supported.')
    }

    for (const tool of tools) {
      globalThis.__APPLE_LLM_TOOLS__[tool.id] = tool.execute
    }

    let streamId: string | null = null
    let listeners: { remove(): void }[] = []

    const cleanup = () => {
      listeners.forEach((listener) => listener.remove())
      listeners = []

      for (const tool of tools) {
        globalThis.__APPLE_LLM_TOOLS__[tool.id] = undefined
      }
    }

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        try {
          streamId = NativeAppleLLM.generateStream(messages, {
            maxTokens: options.maxOutputTokens,
            temperature: options.temperature,
            topP: options.topP,
            topK: options.topK,
            tools,
            schema,
          })

          controller.enqueue({
            type: 'text-start',
            id: streamId,
          })

          let previousContent = ''

          const updateListener = NativeAppleLLM.onStreamUpdate((data) => {
            if (data.streamId === streamId) {
              const delta = data.content.slice(previousContent.length)
              controller.enqueue({
                type: 'text-delta',
                delta,
                id: data.streamId,
              })
              previousContent = data.content
            }
          })

          const completeListener = NativeAppleLLM.onStreamComplete((data) => {
            if (data.streamId === streamId) {
              controller.enqueue({
                type: 'text-end',
                id: streamId,
              })
              controller.enqueue({
                type: 'finish',
                finishReason: 'stop',
                usage: {
                  inputTokens: 0,
                  outputTokens: 0,
                  totalTokens: 0,
                },
              })
              cleanup()
              controller.close()
            }
          })

          const errorListener = NativeAppleLLM.onStreamError((data) => {
            if (data.streamId === streamId) {
              controller.enqueue({
                type: 'error',
                error: data.error,
              })
              cleanup()
              controller.close()
            }
          })

          listeners = [updateListener, completeListener, errorListener]
        } catch (error) {
          cleanup()
          controller.error(new Error(`Apple LLM stream failed: ${error}`))
        }
      },
      cancel() {
        cleanup()
        if (streamId) {
          NativeAppleLLM.cancelStream(streamId)
        }
      },
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
