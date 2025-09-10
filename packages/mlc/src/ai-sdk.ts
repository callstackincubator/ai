import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider'

import NativeMLCEngine, { downloadModel, type Message } from './NativeMLCEngine'

export const mlc = {
  languageModel: (modelId: string = 'Llama-3.2-3B-Instruct') => {
    return new MlcChatLanguageModel(modelId)
  },
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

  public download() {
    return downloadModel(this.modelId)
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

    const text = await NativeMLCEngine.generateText(messages)

    return {
      content: [{ type: 'text' as const, text }],
      finishReason: 'stop' as const,
      // tbd: expose usage
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

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        `ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.`
      )
    }

    let streamId: string | null = null
    let listeners: { remove(): void }[] = []

    const cleanup = () => {
      listeners.forEach((listener) => listener.remove())
      listeners = []
    }

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        try {
          streamId = await NativeMLCEngine.streamText(messages)

          controller.enqueue({
            type: 'text-start',
            id: streamId,
          })

          let previousContent = ''

          const updateListener = NativeMLCEngine.onChatUpdate((data) => {
            if (data.content) {
              const delta = data.content.slice(previousContent.length)
              controller.enqueue({
                type: 'text-delta',
                delta,
                id: streamId!,
              })
              previousContent = data.content
            }
          })

          const completeListener = NativeMLCEngine.onChatComplete(() => {
            controller.enqueue({
              type: 'text-end',
              id: streamId!,
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
          })

          listeners = [updateListener, completeListener]
        } catch (error) {
          cleanup()
          controller.error(new Error(`MLC stream failed: ${error}`))
        }
      },
      cancel() {
        cleanup()
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
