import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FinishReason,
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
  LanguageModelV3ProviderTool,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'
import {
  type Tool as FullToolDefinition,
  generateId,
  jsonSchema,
  parseJSON,
  type ToolExecutionOptions,
} from '@ai-sdk/provider-utils'

import {
  type AdkAgentConfig,
  type AdkGenerationOptions,
  type AdkMessage,
  type AdkModelType,
  type AdkTool,
  type AdkToolParameter,
  getNativeAdkEngine,
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

class AdkChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3'
  readonly supportedUrls = {}

  readonly provider = 'adk'
  readonly modelId: string

  private readonly agentConfig: AdkAgentConfig
  private tools: ToolDefinitionSet = {}

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

  private prepareMessages(messages: LanguageModelV3Prompt): AdkMessage[] {
    return messages.map((message): AdkMessage => {
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
        role: message.role as AdkMessage['role'],
        content,
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
          'ADK does not support required toolChoice yet. Defaulting to auto.'
        )
      }

      const response = await getNativeAdkEngine().generateText(
        messages,
        this.agentConfig,
        generationOptions,
        nativeTools
      )

      return {
        content: [{ type: 'text' as const, text: response.content }],
        finishReason: convertFinishReason(response.finishReason),
        usage: {
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
        },
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

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        'ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.'
      )
    }

    this.registerTools(preparedTools)

    let streamId: string | undefined
    let listeners: { remove(): void }[] = []

    const cleanup = () => {
      listeners.forEach((listener) => {
        listener.remove()
      })
      listeners = []
      this.unregisterTools(preparedTools)
    }

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: async (controller) => {
        const toolListener = this.createToolCallListener()

        try {
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
                  usage: {
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
                  },
                })
                cleanup()
                toolListener.remove()
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
              toolListener.remove()
              controller.close()
            }
          })

          listeners = [updateListener, completeListener, errorListener]
        } catch (error) {
          cleanup()
          toolListener.remove()
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
