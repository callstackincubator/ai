import type { LanguageModelV1StreamPart } from '@ai-sdk/provider'

import NativeAppleLLMSpec, {
  type AppleGenerationOptions,
  type AppleMessage,
} from './NativeAppleLLM'

export function generateStream(
  messages: AppleMessage[],
  options: AppleGenerationOptions = {}
): ReadableStream<LanguageModelV1StreamPart> {
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

  const stream = new ReadableStream<LanguageModelV1StreamPart>({
    async start(controller) {
      try {
        streamId = NativeAppleLLMSpec.generateStream(messages, options)

        const updateListener = NativeAppleLLMSpec.onStreamUpdate((data) => {
          if (data.streamId === streamId) {
            controller.enqueue({
              type: 'text-delta',
              textDelta: data.content,
            })
          }
        })

        const completeListener = NativeAppleLLMSpec.onStreamComplete((data) => {
          if (data.streamId === streamId) {
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: {
                promptTokens: 0,
                completionTokens: 0,
              },
            })
            cleanup()
            controller.close()
          }
        })

        const errorListener = NativeAppleLLMSpec.onStreamError((data) => {
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
        NativeAppleLLMSpec.cancelStream(streamId)
      }
    },
  })

  return stream
}
