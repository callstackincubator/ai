import {
  type LanguageModelV1,
  type LanguageModelV1CallOptions,
  type LanguageModelV1CallWarning,
  type LanguageModelV1FinishReason,
  type LanguageModelV1FunctionToolCall,
  type LanguageModelV1StreamPart,
} from '@ai-sdk/provider'
import { NativeEventEmitter, NativeModules, Platform } from 'react-native'
import { type EmitterSubscription, LogBox } from 'react-native'
import {
  ReadableStream,
  ReadableStreamDefaultController,
} from 'web-streams-polyfill'

import MlcEngine from './NativeAi'

export interface AiModelSettings extends Record<string, unknown> {
  model_id?: string
}

export interface Model {
  modelId: string
  modelLib: string
}

export interface Message {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string
}

LogBox.ignoreLogs(['new NativeEventEmitter', 'Avatar:'])

export class MlcProvider implements LanguageModelV1 {
  readonly specificationVersion = 'v1'
  readonly defaultObjectGenerationMode = 'json'
  readonly provider = 'mlc'
  public modelId: string
  private options: AiModelSettings

  constructor(modelId?: string, options: AiModelSettings = {}) {
    this.modelId = modelId || 'Llama-3.2-3B-Instruct'
    this.options = options
  }

  private model!: Model
  async getModel() {
    // @ts-ignore
    this.model = await MlcEngine.getModel(this.modelId)
    return this.model
  }

  async doGenerate(options: LanguageModelV1CallOptions): Promise<{
    text?: string
    toolCalls?: LanguageModelV1FunctionToolCall[]
    finishReason: LanguageModelV1FinishReason
    usage: {
      promptTokens: number
      completionTokens: number
    }
    rawCall: {
      rawPrompt: unknown
      rawSettings: Record<string, unknown>
    }
  }> {
    const model = await this.getModel()
    const messages = options.prompt
    const extractedMessages = messages.map((message): Message => {
      let content = ''

      if (Array.isArray(message.content)) {
        content = message.content
          .map((messageContent) =>
            messageContent.type === 'text'
              ? messageContent.text
              : messageContent
          )
          .join('')
      } else {
        content = typeof message.content === 'string' ? message.content : ''
      }

      return {
        role: message.role,
        content,
      }
    })

    let text = ''

    if (messages.length > 0) {
      text = await MlcEngine.doGenerate(model.modelId, extractedMessages)
    }

    return {
      text,
      finishReason: 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
      rawCall: {
        rawPrompt: options,
        rawSettings: {},
      },
    }
  }

  stream: ReadableStream<LanguageModelV1StreamPart> | null = null
  controller: ReadableStreamDefaultController<LanguageModelV1StreamPart> | null =
    null
  streamId: string | null = null
  chatUpdateListener: EmitterSubscription | null = null
  chatCompleteListener: EmitterSubscription | null = null
  chatErrorListener: EmitterSubscription | null = null
  isStreamClosed: boolean = false

  public doStream = async (
    options: LanguageModelV1CallOptions
  ): Promise<{
    stream: ReadableStream<LanguageModelV1StreamPart>
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> }
    rawResponse?: { headers?: Record<string, string> }
    warnings?: LanguageModelV1CallWarning[]
  }> => {
    // Reset stream state
    this.isStreamClosed = false
    const messages = options.prompt
    const extractedMessages = messages.map((message): Message => {
      let content = ''

      if (Array.isArray(message.content)) {
        content = message.content
          .map((messageContent) =>
            messageContent.type === 'text'
              ? messageContent.text
              : messageContent
          )
          .join('')
      } else {
        content = typeof message.content === 'string' ? message.content : ''
      }

      return {
        role: message.role,
        content,
      }
    })
    const model = await this.getModel()

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      start: (controller) => {
        this.controller = controller

        const eventEmitter =
          Platform.OS === 'android'
            ? new NativeEventEmitter()
            : new NativeEventEmitter(NativeModules.Ai)

        this.chatCompleteListener = eventEmitter.addListener(
          'onChatComplete',
          () => {
            try {
              if (!this.isStreamClosed && this.controller) {
                this.controller.enqueue({
                  type: 'finish',
                  finishReason: 'stop',
                  usage: {
                    promptTokens: 0,
                    completionTokens: 0,
                  },
                })
                this.isStreamClosed = true
                this.controller.close()
              }
            } catch (error) {
              console.error('Error in complete handler:', error)
            }
          }
        )

        this.chatErrorListener = eventEmitter.addListener(
          'onChatUpdate',
          (data) => {
            try {
              if (!this.isStreamClosed && this.controller) {
                if (data.error) {
                  this.controller.enqueue({ type: 'error', error: data.error })
                  this.isStreamClosed = true
                  this.controller.close()
                } else {
                  this.controller.enqueue({
                    type: 'text-delta',
                    textDelta: data.content || '',
                  })
                }
              }
            } catch (error) {
              console.error('Error in update handler:', error)
            }
          }
        )

        if (!model) {
          throw new Error('Model not initialized')
        }

        MlcEngine.doStream(model.modelId, extractedMessages)
      },
      cancel: () => {
        this.isStreamClosed = true
        if (this.chatUpdateListener) {
          this.chatUpdateListener.remove()
        }
        if (this.chatCompleteListener) {
          this.chatCompleteListener.remove()
        }
        if (this.chatErrorListener) {
          this.chatErrorListener.remove()
        }
      },
    })

    return {
      stream,
      rawCall: { rawPrompt: options.prompt, rawSettings: this.options },
    }
  }
}
