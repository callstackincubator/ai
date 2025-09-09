import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider'
import { NativeEventEmitter, NativeModules, Platform } from 'react-native'

import NativeMLCEngine, { downloadModel, type Message } from './NativeMLCEngine'

export function createMlcProvider(modelId: string = 'Llama-3.2-3B-Instruct') {
  const createLanguageModel = () => {
    return new MlcChatLanguageModel(modelId)
  }
  const provider = function () {
    return createLanguageModel()
  }
  provider.languageModel = createLanguageModel
  provider.prepare = () => {
    return NativeMLCEngine.prepareModel(modelId)
  }
  provider.download = () => {
    return downloadModel(modelId)
  }
  return provider
}

export const mlc = (modelId?: string) => createMlcProvider(modelId)()

class MlcChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2'
  readonly supportedUrls = {}

  readonly provider = 'mlc'
  readonly modelId: string

  constructor(modelId: string) {
    this.modelId = modelId
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

    // Ensure model is ready
    const model = await NativeMLCEngine.getModel(this.modelId)

    // Generate text
    const text = await NativeMLCEngine.generateText(model.modelId, messages)

    return {
      content: [{ type: 'text' as const, text }],
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

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        `ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.`
      )
    }

    // Ensure model is ready
    const model = await NativeMLCEngine.getModel(this.modelId)

    let streamId: string | null = null
    let listeners: { remove(): void }[] = []

    const cleanup = () => {
      listeners.forEach((listener) => listener.remove())
      listeners = []
    }

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        try {
          // Start streaming
          streamId = await NativeMLCEngine.streamText(model.modelId, messages)

          const eventEmitter =
            Platform.OS === 'android'
              ? new NativeEventEmitter()
              : new NativeEventEmitter(NativeModules.MLCEngine)

          controller.enqueue({
            type: 'text-start',
            id: streamId,
          })

          const updateListener = eventEmitter.addListener(
            'onChatUpdate',
            (data) => {
              if (data.content) {
                controller.enqueue({
                  type: 'text-delta',
                  delta: data.content,
                  id: streamId!,
                })
              }
            }
          )

          const completeListener = eventEmitter.addListener(
            'onChatComplete',
            () => {
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
            }
          )

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
