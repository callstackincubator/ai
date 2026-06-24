import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FilePart,
  LanguageModelV3FinishReason,
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
  LanguageModelV3ProviderTool,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider'
import {
  generateId,
  jsonSchema,
  parseJSON,
  type Tool as FullToolDefinition,
  type ToolExecutionOptions,
} from '@ai-sdk/provider-utils'

import { isADKNanoSupported } from './adk-platform'
import {
  type AdkAgentConfig,
  type AdkGenerationOptions,
  type AdkMessage,
  type AdkMessagePart,
  type AdkModelType,
  type AdkTool,
  type AdkToolParameter,
  type AdkUsageMetadata,
  getNativeAdkEngine,
  type StreamToolCallEvent,
  type ToolCallEvent,
} from './NativeAdkEngine'

export interface AdkProviderOptions {
  name?: string
  description?: string
  instruction?: string
  modelType?: AdkModelType
  modelName?: string
  apiKey?: string
  availableTools?: Record<string, FullToolDefinition>
}

export function createAdkProvider(options: AdkProviderOptions = {}) {
  const createLanguageModel = () => new AdkChatLanguageModel(options)

  const provider = () => createLanguageModel()
  provider.languageModel = createLanguageModel
  provider.isAvailable = (modelType: AdkModelType = 'gemini') =>
    getNativeAdkEngine().isAvailable(modelType).then(Boolean)
  provider.prepareNano = () => getNativeAdkEngine().prepareNano()

  return provider
}

export const adk = createAdkProvider()

type Tool = LanguageModelV3FunctionTool | LanguageModelV3ProviderTool
type ToolDefinitionSet = Record<string, FullToolDefinition>

const createEmptyUsage = (): LanguageModelV3Usage => ({
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: undefined,
    text: undefined,
    reasoning: undefined,
  },
})

const mapUsage = (usage?: AdkUsageMetadata): LanguageModelV3Usage => {
  if (!usage) {
    return createEmptyUsage()
  }

  return {
    inputTokens: {
      total: usage.promptTokenCount,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage.candidatesTokenCount,
      text: undefined,
      reasoning: undefined,
    },
    raw: {
      promptTokenCount: usage.promptTokenCount,
      candidatesTokenCount: usage.candidatesTokenCount,
      totalTokenCount: usage.totalTokenCount,
    },
  }
}

const convertFinishReason = (
  finishReason?: string
): LanguageModelV3FinishReason => {
  let unified: LanguageModelV3FinishReason['unified'] = 'other'

  if (finishReason === 'STOP' || finishReason === 'stop') {
    unified = 'stop'
  } else if (finishReason === 'MAX_TOKENS' || finishReason === 'length') {
    unified = 'length'
  } else if (finishReason === 'tool_calls' || finishReason === 'TOOL_CALLS') {
    unified = 'tool-calls'
  }

  return {
    unified,
    raw: finishReason,
  }
}

const schemaPropertyToAdkParameter = (
  name: string,
  value: unknown,
  required: boolean
): AdkToolParameter => {
  const schema = value as {
    type?: string
    description?: string
  }

  return {
    name,
    description: schema?.description,
    type: (schema?.type as AdkToolParameter['type']) ?? 'string',
    required,
  }
}

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary)
}

const normalizeFilePart = (
  part: LanguageModelV3FilePart
): { data: string; mediaType: string } => {
  if (part.data instanceof URL) {
    throw new Error(
      'ADK wrapper does not support file URLs yet. Pass base64 or Uint8Array data.'
    )
  }

  const data =
    typeof part.data === 'string'
      ? part.data.replace(/^data:[^;]+;base64,/, '')
      : uint8ArrayToBase64(part.data)

  return {
    data,
    mediaType: part.mediaType,
  }
}

class AdkChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3'
  readonly supportedUrls = {}

  readonly provider = 'adk'
  readonly modelId: string

  private readonly agentConfig: AdkAgentConfig
  private tools: ToolDefinitionSet = {}
  private nanoPreparePromise: Promise<void> | null = null

  constructor(options: AdkProviderOptions) {
    const modelType = options.modelType ?? 'gemini'
    this.modelId = options.modelName ?? 'gemini-2.5-flash'
    this.agentConfig = {
      name: options.name ?? 'react_native_adk_agent',
      description: options.description ?? 'React Native ADK agent',
      instruction: options.instruction,
      model: {
        type: modelType,
        name: this.modelId,
        apiKey: options.apiKey,
      },
    }
    this.updateTools(options.availableTools ?? {})
  }

  updateTools(tools: ToolDefinitionSet) {
    this.tools = tools
  }

  public isAvailable() {
    return getNativeAdkEngine()
      .isAvailable(this.agentConfig.model.type)
      .then(Boolean)
  }

  public prepareNano() {
    return getNativeAdkEngine().prepareNano()
  }

  async prepare(): Promise<void> {
    await this.ensureNanoPrepared()
  }

  private ensureNanoPrepared(): Promise<void> {
    if (this.agentConfig.model.type !== 'genai-nano') {
      return Promise.resolve()
    }

    if (!this.nanoPreparePromise) {
      this.nanoPreparePromise = isADKNanoSupported()
        .then((supported) => {
          if (!supported) {
            throw new Error(
              'Gemini Nano is not supported on this device or device has not fetched the latest configuration to support it'
            )
          }
          return getNativeAdkEngine().prepareNano()
        })
        .catch((error) => {
          this.nanoPreparePromise = null
          throw error
        })
    }

    return this.nanoPreparePromise
  }

  private prepareMessages(messages: LanguageModelV3Prompt): AdkMessage[] {
    return messages.map((message): AdkMessage => {
      if (message.role === 'system') {
        return {
          role: 'system',
          content: message.content,
        }
      }

      if (message.role === 'user') {
        const parts = message.content
          .map((part): AdkMessagePart | null => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text }
            }
            if (part.type === 'file') {
              const { data, mediaType } = normalizeFilePart(part)
              return { type: 'file', mimeType: mediaType, data }
            }
            console.warn('Unsupported user message content type:', part)
            return null
          })
          .filter((part): part is AdkMessagePart => part !== null)

        if (parts.length === 1 && parts[0]?.type === 'text') {
          return {
            role: 'user',
            content: parts[0].text,
          }
        }

        return {
          role: 'user',
          parts,
        }
      }

      if (message.role === 'assistant') {
        const content = message.content.reduce((acc, part) => {
          if (part.type === 'text') {
            return acc + part.text
          }
          console.warn('Unsupported assistant message content type:', part)
          return acc
        }, '')

        return {
          role: 'assistant',
          content,
        }
      }

      console.warn('Unsupported message role for ADK provider:', message.role)
      return {
        role: 'user',
        content: '',
      }
    })
  }

  private prepareGenerationOptions(
    options: LanguageModelV3CallOptions
  ): AdkGenerationOptions {
    return {
      temperature: options.temperature,
      maxTokens: options.maxOutputTokens,
      topP: options.topP,
      topK: options.topK,
      responseFormat:
        options.responseFormat?.type === 'json' && options.responseFormat.schema
          ? {
              type: 'json',
              mimeType: 'application/json',
              schema: options.responseFormat.schema,
            }
          : undefined,
    }
  }

  private prepareTools(tools: Tool[] = []) {
    return tools
      .filter((tool) => tool.type === 'function')
      .map((tool) => {
        const required = Array.isArray(tool.inputSchema.required)
          ? tool.inputSchema.required
          : []
        const properties = tool.inputSchema.properties ?? {}

        const parameters = Object.entries(properties).map(([name, value]) =>
          schemaPropertyToAdkParameter(name, value, required.includes(name))
        )

        const schema = jsonSchema(tool.inputSchema)

        return {
          native: {
            id: generateId(),
            name: tool.name,
            description: tool.description ?? '',
            parameters,
          } satisfies AdkTool,
          execute: async (modelInput: unknown) => {
            const text =
              typeof modelInput === 'string'
                ? modelInput
                : JSON.stringify(modelInput ?? {})
            const toolCallArguments = await parseJSON({
              text,
              schema,
            })
            const opts: ToolExecutionOptions = {
              toolCallId: generateId(),
              messages: [],
            }
            return this.tools[tool.name]?.execute?.(toolCallArguments, opts)
          },
        }
      })
  }

  private registerTools(
    preparedTools: ReturnType<AdkChatLanguageModel['prepareTools']>
  ) {
    globalThis.__ADK_TOOLS__ = globalThis.__ADK_TOOLS__ ?? {}

    for (const tool of preparedTools) {
      globalThis.__ADK_TOOLS__[tool.native.id] = tool.execute
    }
  }

  private unregisterTools(
    preparedTools: ReturnType<AdkChatLanguageModel['prepareTools']>
  ) {
    for (const tool of preparedTools) {
      delete globalThis.__ADK_TOOLS__?.[tool.native.id]
    }
  }

  private createToolCallListener() {
    const native = getNativeAdkEngine()

    return native.onToolCall(async (event: ToolCallEvent) => {
      const executor = globalThis.__ADK_TOOLS__?.[event.toolId]
      if (!executor) {
        native.submitToolResult(
          event.toolCallId,
          JSON.stringify({ error: `Tool not found: ${event.toolId}` })
        )
        return
      }

      try {
        const result = await executor(event.arguments)
        native.submitToolResult(
          event.toolCallId,
          typeof result === 'string' ? result : JSON.stringify(result ?? {})
        )
      } catch (error) {
        native.submitToolResult(
          event.toolCallId,
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          })
        )
      }
    })
  }

  async doGenerate(options: LanguageModelV3CallOptions) {
    const messages = this.prepareMessages(options.prompt)
    const generationOptions = this.prepareGenerationOptions(options)
    const preparedTools = this.prepareTools(options.tools)
    const nativeTools = preparedTools.map((tool) => tool.native)

    this.registerTools(preparedTools)
    const toolListener = this.createToolCallListener()

    try {
      if (options.toolChoice && options.toolChoice.type === 'required') {
        console.warn(
          'ADK wrapper does not support required toolChoice yet. Defaulting to auto.'
        )
      }

      await this.ensureNanoPrepared()

      const response = await getNativeAdkEngine().generateText(
        messages,
        this.agentConfig,
        generationOptions,
        nativeTools
      )

      return {
        content: [{ type: 'text' as const, text: response.content }],
        finishReason: convertFinishReason(response.finishReason),
        usage: mapUsage(response.usage),
        warnings: [],
      }
    } finally {
      toolListener.remove()
      this.unregisterTools(preparedTools)
    }
  }

  async doStream(options: LanguageModelV3CallOptions) {
    const messages = this.prepareMessages(options.prompt)
    const generationOptions = this.prepareGenerationOptions(options)
    const preparedTools = this.prepareTools(options.tools)
    const nativeTools = preparedTools.map((tool) => tool.native)
    const agentConfig = this.agentConfig

    if (options.responseFormat?.type === 'json') {
      throw new Error('Streaming JSON responses is not yet supported by ADK.')
    }

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        'ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.'
      )
    }

    this.registerTools(preparedTools)

    let streamId: string | undefined
    let listeners: { remove(): void }[] = []
    const toolListener = this.createToolCallListener()

    const cleanup = () => {
      listeners.forEach((listener) => {
        listener.remove()
      })
      listeners = []
      toolListener.remove()
      this.unregisterTools(preparedTools)
    }

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: async (controller) => {
        try {
          await this.ensureNanoPrepared()

          streamId = await getNativeAdkEngine().streamText(
            messages,
            agentConfig,
            generationOptions,
            nativeTools
          )

          const currentStreamId = streamId

          controller.enqueue({
            type: 'text-start',
            id: currentStreamId,
          })

          const updateListener = getNativeAdkEngine().onStreamUpdate((data) => {
            if (data.streamId === currentStreamId && data.delta) {
              controller.enqueue({
                type: 'text-delta',
                delta: data.delta,
                id: currentStreamId,
              })
            }
          })

          const streamToolCallListener = getNativeAdkEngine().onStreamToolCall(
            (data: StreamToolCallEvent) => {
              if (data.streamId !== currentStreamId) {
                return
              }

              if (data.phase === 'start' && data.toolName) {
                controller.enqueue({
                  type: 'tool-input-start',
                  id: data.toolCallId,
                  toolName: data.toolName,
                  providerExecuted: true,
                })
                return
              }

              if (data.phase === 'delta' && data.inputDelta) {
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: data.toolCallId,
                  delta: data.inputDelta,
                })
                return
              }

              if (data.phase === 'end' && data.toolName && data.input) {
                controller.enqueue({
                  type: 'tool-input-end',
                  id: data.toolCallId,
                })
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: data.toolCallId,
                  toolName: data.toolName,
                  input: data.input,
                  providerExecuted: true,
                })
              }
            }
          )

          const completeListener = getNativeAdkEngine().onStreamComplete(
            (data) => {
              if (data.streamId === currentStreamId) {
                controller.enqueue({
                  type: 'text-end',
                  id: currentStreamId,
                })
                controller.enqueue({
                  type: 'finish',
                  finishReason: convertFinishReason(data.finishReason),
                  usage: mapUsage(data.usage),
                })
                cleanup()
                controller.close()
              }
            }
          )

          const errorListener = getNativeAdkEngine().onStreamError((data) => {
            if (data.streamId === currentStreamId) {
              controller.enqueue({
                type: 'error',
                error: new Error(data.error),
              })
              cleanup()
              controller.close()
            }
          })

          listeners = [
            updateListener,
            streamToolCallListener,
            completeListener,
            errorListener,
          ]
        } catch (error) {
          cleanup()
          controller.error(new Error(`ADK stream failed: ${error}`))
        }
      },
      cancel: () => {
        cleanup()
        if (streamId) {
          getNativeAdkEngine().cancelStream(streamId)
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
