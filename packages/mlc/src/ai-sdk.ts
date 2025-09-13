import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2FinishReason,
  LanguageModelV2FunctionTool,
  LanguageModelV2Prompt,
  LanguageModelV2ProviderDefinedTool,
  LanguageModelV2StreamPart,
  LanguageModelV2ToolChoice,
} from '@ai-sdk/provider'

import NativeMLCEngine, {
  DownloadProgress,
  type GeneratedMessage,
  type GenerationOptions,
  type Message,
} from './NativeMLCEngine'

export const mlc = {
  languageModel: (modelId: string = 'Llama-3.2-3B-Instruct') => {
    return new MlcChatLanguageModel(modelId)
  },
}

const convertToolsToNativeFormat = (
  tools: (LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool)[]
) => {
  return tools
    .filter((tool) => tool.type === 'function')
    .map((tool) => {
      const parameters: Record<string, string> = {}
      if (tool.inputSchema.properties) {
        Object.entries(tool.inputSchema.properties).forEach(([key, value]) => {
          if (!value) {
            return
          }
          parameters[key] = (value as any)?.description || ''
        })
      }
      return {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters,
        },
      }
    })
}

const convertToolChoice = (
  toolChoice?: LanguageModelV2ToolChoice
): 'none' | 'auto' | undefined => {
  if (!toolChoice) {
    return 'none'
  }
  if (toolChoice.type === 'none' || toolChoice.type === 'auto') {
    return toolChoice.type
  }
  console.warn(
    `Unsupported toolChoice value: ${JSON.stringify(toolChoice)}. Defaulting to 'none'.`
  )
  return undefined
}

const convertFinishReason = (
  finishReason: GeneratedMessage['finish_reason']
): LanguageModelV2FinishReason => {
  if (finishReason === 'tool_calls') {
    return 'tool-calls'
  }
  return finishReason
}

class MlcChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2'
  readonly supportedUrls = {}

  readonly provider = 'mlc'
  readonly modelId: string

  constructor(modelId: string) {
    this.modelId = modelId
  }

  public prepare() {
    return NativeMLCEngine.prepareModel(this.modelId)
  }

  public async download(progressCallback?: (event: DownloadProgress) => void) {
    const removeListener = NativeMLCEngine.onDownloadProgress((event) => {
      progressCallback?.(event)
    })
    await NativeMLCEngine.downloadModel(this.modelId)
    removeListener.remove()
  }

  public unload() {
    return NativeMLCEngine.unloadModel()
  }

  public remove() {
    return NativeMLCEngine.removeModel(this.modelId)
  }

  private prepareMessages(messages: LanguageModelV2Prompt): Message[] {
    return messages.map((message): Message => {
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
        role: message.role as Message['role'],
        content,
      }
    })
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const messages = this.prepareMessages(options.prompt)

    const generationOptions: GenerationOptions = {
      temperature: options.temperature,
      maxTokens: options.maxOutputTokens,
      topP: options.topP,
      topK: options.topK,
      responseFormat:
        options.responseFormat?.type === 'json'
          ? {
              type: 'json_object',
              schema: JSON.stringify(options.responseFormat.schema),
            }
          : undefined,
      tools: convertToolsToNativeFormat(options.tools || []),
      toolChoice: convertToolChoice(options.toolChoice),
    }

    const response = await NativeMLCEngine.generateText(
      messages,
      generationOptions
    )

    return {
      content: [
        { type: 'text' as const, text: response.content },
        ...response.tool_calls.map((toolCall) => ({
          type: 'tool-call' as const,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: JSON.stringify(toolCall.function.arguments || {}),
        })),
      ],
      finishReason: convertFinishReason(response.finish_reason),
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      providerMetadata: {
        mlc: {
          extraUsage: {
            ...response.usage.extra,
          },
        },
      },
      warnings: [],
    }
  }

  async doStream(options: LanguageModelV2CallOptions) {
    const messages = this.prepareMessages(options.prompt)

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        `ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.`
      )
    }

    const generationOptions: GenerationOptions = {
      temperature: options.temperature,
      maxTokens: options.maxOutputTokens,
      topP: options.topP,
      topK: options.topK,
      responseFormat:
        options.responseFormat?.type === 'json'
          ? {
              type: 'json_object',
              schema: JSON.stringify(options.responseFormat.schema),
            }
          : undefined,
      tools: convertToolsToNativeFormat(options.tools || []),
      toolChoice: convertToolChoice(options.toolChoice),
    }

    let streamId: string | undefined
    let listeners: { remove(): void }[] = []

    const cleanup = () => {
      listeners.forEach((listener) => listener.remove())
      listeners = []
    }

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        try {
          const id = (streamId = await NativeMLCEngine.streamText(
            messages,
            generationOptions
          ))

          controller.enqueue({
            type: 'text-start',
            id,
          })

          const updateListener = NativeMLCEngine.onChatUpdate((data) => {
            if (data.content) {
              controller.enqueue({
                type: 'text-delta',
                delta: data.content,
                id,
              })
            }
          })

          const completeListener = NativeMLCEngine.onChatComplete((data) => {
            controller.enqueue({
              type: 'text-end',
              id,
            })
            controller.enqueue({
              type: 'finish',
              finishReason: convertFinishReason(data.finish_reason),
              usage: {
                inputTokens: data.usage.prompt_tokens,
                outputTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
              },
              providerMetadata: {
                mlc: {
                  extraUsage: {
                    ...data.usage.extra,
                  },
                },
              },
            })
            cleanup()
            controller.close()
          })

          listeners = [updateListener, completeListener]
        } catch (error) {
          cleanup()
          controller.error(new Error(`MLC stream failed: ${error}`))
        }
      },
      cancel() {
        cleanup()
        if (streamId) {
          NativeMLCEngine.cancelStream(streamId)
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
