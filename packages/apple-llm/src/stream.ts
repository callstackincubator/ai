import type { LanguageModelV2StreamPart } from '@ai-sdk/provider'

import NativeAppleLLMSpec, {
  type AppleGenerationOptions,
  type AppleMessage,
} from './NativeAppleLLM'

export function generateStream(
  messages: AppleMessage[],
  options: AppleGenerationOptions = {}
): ReadableStream<LanguageModelV2StreamPart> {
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
        streamId = NativeAppleLLMSpec.generateStream(messages, options)

        controller.enqueue({
          type: 'text-start',
          id: streamId,
        })

        const updateListener = NativeAppleLLMSpec.onStreamUpdate((data) => {
          if (data.streamId === streamId) {
            controller.enqueue({
              type: 'text-delta',
              delta: data.content,
              id: data.streamId,
            })
          }
        })

        const completeListener = NativeAppleLLMSpec.onStreamComplete((data) => {
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
