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
import { Platform } from 'react-native'

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

/**
 * Whether the device can support on-device Gemini Nano at all
 * (ML Kit `checkStatus !== 0`). Does not download models.
 */
async function checkNanoSupported(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false
  }

  return getNativeAdkEngine().isNanoSupported()
}

export interface AdkProvider {
  (): LanguageModelV3
  languageModel: () => LanguageModelV3
  /** Device capability check (ML Kit `checkStatus !== 0`). Returns `false` on non-Android. */
  isNanoSupported: () => Promise<boolean>
  /**
   * Whether `modelType` can be used now. For `genai-nano`, checks ML Kit readiness
   * (status 1 or 3). Returns `false` when {@link isNanoSupported} is `false`.
   * Cloud `gemini` always resolves to `true` on Android.
   */
  isAvailable: (modelType?: AdkModelType) => Promise<boolean>
  /** Downloads and initializes on-device Gemini Nano. No-op for cloud models. */
  prepareNano: () => Promise<void>
}

export function createAdkProvider(
  options: AdkProviderOptions = {}
): AdkProvider {
  const createLanguageModel = () => new AdkChatLanguageModel(options)

  return Object.assign(() => createLanguageModel(), {
    languageModel: createLanguageModel,
    isNanoSupported: () => checkNanoSupported(),
    isAvailable: async (modelType: AdkModelType = 'gemini') => {
      if (modelType === 'genai-nano' && !(await checkNanoSupported())) {
        return false
      }
      return getNativeAdkEngine().isAvailable(modelType).then(Boolean)
    },
    prepareNano: () => getNativeAdkEngine().prepareNano(),
  })
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
      this.nanoPreparePromise = checkNanoSupported()
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

      if (message.role === 'tool') {
        const content = message.content
          .filter((part) => part.type === 'tool-result')
          .map((part) => {
            if (part.output.type === 'execution-denied') {
              return part.output.reason ?? 'Execution denied'
            }
            return typeof part.output.value === 'string'
              ? part.output.value
              : JSON.stringify(part.output.value)
          })
          .join('\n')

        return {
          role: 'user',
          content,
        }
      }

      throw new Error(
        `Unsupported message role for ADK provider: ${message.role}`
      )
    })
  }

  private prepareGenerationOptions(
    options: LanguageModelV3CallOptions
  ): AdkGenerationOptions {
    if (
      options.responseFormat?.type === 'json' &&
      options.responseFormat.schema
    ) {
      throw new Error(
        'ADK does not support responseFormat.schema yet. Use JSON mode without a schema or omit responseFormat.'
      )
    }

    return {
      temperature: options.temperature,
      maxTokens: options.maxOutputTokens,
      topP: options.topP,
      topK: options.topK,
      responseFormat:
        options.responseFormat?.type === 'json'
          ? {
              type: 'json',
              mimeType: 'application/json',
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

  private createToolCallListener(scope: {
    streamId?: string
    runId?: string
    ownedToolIds: Set<string>
  }) {
    const native = getNativeAdkEngine()

    return native.onToolCall(async (event: ToolCallEvent) => {
      if (scope.streamId !== undefined && event.streamId !== scope.streamId) {
        return
      }
      if (scope.runId !== undefined && event.runId !== scope.runId) {
        return
      }
      if (!scope.ownedToolIds.has(event.toolId)) {
        return
      }

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
    const ownedToolIds = new Set(preparedTools.map((tool) => tool.native.id))
    const runId = generateId()

    this.registerTools(preparedTools)
    const toolListener = this.createToolCallListener({ runId, ownedToolIds })

    try {
      if (options.toolChoice && options.toolChoice.type === 'required') {
        console.warn(
          'ADK wrapper does not support required toolChoice yet. Defaulting to auto.'
        )
      }

      await this.ensureNanoPrepared()

      const response = await getNativeAdkEngine().generateText(
        runId,
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
    const streamId = generateId()
    const ownedToolIds = new Set(preparedTools.map((tool) => tool.native.id))

    if (options.responseFormat?.type === 'json') {
      throw new Error('Streaming JSON responses is not yet supported by ADK.')
    }

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        'ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.'
      )
    }

    this.registerTools(preparedTools)

    let listeners: { remove(): void }[] = []
    let cleanedUp = false
    const toolListener = this.createToolCallListener({ streamId, ownedToolIds })

    const cleanup = () => {
      if (cleanedUp) {
        return
      }
      cleanedUp = true
      listeners.forEach((listener) => {
        listener.remove()
      })
      listeners = []
      toolListener.remove()
      this.unregisterTools(preparedTools)
    }

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: async (controller) => {
        const addListener = (listener: { remove(): void }) => {
          listeners.push(listener)
        }

        addListener(
          getNativeAdkEngine().onStreamUpdate((data) => {
            if (data.streamId === streamId && data.delta) {
              controller.enqueue({
                type: 'text-delta',
                delta: data.delta,
                id: streamId,
              })
            }
          })
        )

        addListener(
          getNativeAdkEngine().onStreamToolCall((data: StreamToolCallEvent) => {
            if (data.streamId !== streamId) {
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
          })
        )

        addListener(
          getNativeAdkEngine().onStreamComplete((data) => {
            if (data.streamId === streamId) {
              controller.enqueue({
                type: 'text-end',
                id: streamId,
              })
              controller.enqueue({
                type: 'finish',
                finishReason: convertFinishReason(data.finishReason),
                usage: mapUsage(data.usage),
              })
              cleanup()
              controller.close()
            }
          })
        )

        addListener(
          getNativeAdkEngine().onStreamError((data) => {
            if (data.streamId === streamId) {
              controller.enqueue({
                type: 'error',
                error: new Error(data.error),
              })
              cleanup()
              controller.close()
            }
          })
        )

        try {
          await this.ensureNanoPrepared()

          controller.enqueue({
            type: 'text-start',
            id: streamId,
          })

          await getNativeAdkEngine().streamText(
            streamId,
            messages,
            agentConfig,
            generationOptions,
            nativeTools
          )
        } catch (error) {
          cleanup()
          const message = error instanceof Error ? error.message : String(error)
          controller.error(new Error(`ADK stream failed: ${message}`))
        }
      },
      cancel: () => {
        cleanup()
        void getNativeAdkEngine()
          .cancelStream(streamId)
          .catch((error) => console.warn('[adk] cancelStream failed:', error))
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
