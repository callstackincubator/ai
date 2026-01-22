import type {
  EmbeddingModelV3,
  EmbeddingModelV3CallOptions,
  EmbeddingModelV3Result,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
  LanguageModelV3ProviderTool,
  LanguageModelV3StreamPart,
  SpeechModelV3,
  SpeechModelV3CallOptions,
  TranscriptionModelV3,
  TranscriptionModelV3CallOptions,
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
import NativeAppleSpeech from './NativeAppleSpeech'
import NativeAppleTranscription from './NativeAppleTranscription'
import NativeAppleUtils from './NativeAppleUtils'

type Tool = LanguageModelV3FunctionTool | LanguageModelV3ProviderTool
type ToolSet = Record<string, ToolDefinition>

export function createAppleProvider({
  availableTools,
}: {
  availableTools?: ToolSet
} = {}) {
  const createLanguageModel = () => {
    return new AppleLLMChatLanguageModel(availableTools)
  }
  const provider = function () {
    return createLanguageModel()
  }
  provider.isAvailable = () => NativeAppleLLM.isAvailable()
  provider.languageModel = createLanguageModel
  provider.textEmbeddingModel = (options: AppleEmbeddingOptions = {}) => {
    return new AppleTextEmbeddingModel(options)
  }
  provider.imageModel = () => {
    throw new Error('Image generation models are not supported by Apple LLM')
  }
  provider.transcriptionModel = (options: AppleTranscriptionOptions = {}) => {
    return new AppleTranscriptionModel(options)
  }
  provider.speechModel = (options: AppleSpeechOptions = {}) => {
    return new AppleSpeechModel(options)
  }
  return provider
}

export const apple = createAppleProvider()

export interface AppleTranscriptionOptions {
  language?: string
}

class AppleTranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = 'v3'
  readonly provider = 'apple'

  readonly modelId = 'SpeechTranscriber'

  private prepared = false
  private language: string

  constructor(options: AppleTranscriptionOptions = {}) {
    this.language = options.language ?? NativeAppleUtils.getCurrentLocale()
  }

  async prepare(): Promise<void> {
    await NativeAppleTranscription.prepare(this.language)
    this.prepared = true
  }

  async doGenerate(options: TranscriptionModelV3CallOptions) {
    try {
      let audio = options.audio
      if (typeof audio === 'string') {
        audio = this.base64ToArrayBuffer(audio)
      }

      if (!this.prepared) {
        console.warn(
          '[apple-llm] Model not prepared. Call prepare() ahead of time to optimize performance.'
        )
        await this.prepare()
      }

      const transcriptionResult = await NativeAppleTranscription.transcribe(
        audio.buffer,
        this.language
      )

      const transcriptionText = transcriptionResult.segments
        .map((segment) => segment.text)
        .join(' ')

      return {
        text: transcriptionText,
        segments: transcriptionResult.segments,
        language: this.language,
        durationInSeconds: transcriptionResult.duration,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
        },
      }
    } catch (error) {
      throw new Error(
        `Apple transcription failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private base64ToArrayBuffer(base64: string) {
    let binaryString = atob(base64)
    let bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  }
}

export interface AppleSpeechOptions {
  language?: string
}

class AppleSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3'
  readonly provider = 'apple'

  readonly modelId = 'AVSpeechSynthesizer'

  private language: string

  constructor(options: AppleSpeechOptions = {}) {
    this.language = options.language ?? NativeAppleUtils.getCurrentLocale()
  }

  async prepare(): Promise<void> {}

  async doGenerate(options: SpeechModelV3CallOptions) {
    const speechOptions = {
      language: this.language,
      voice: options.voice,
    }

    try {
      const audio = await NativeAppleSpeech.generate(
        options.text,
        speechOptions
      )

      return {
        audio: new Uint8Array(audio),
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
        },
      }
    } catch (error) {
      throw new Error(
        `Apple speech synthesis failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

export interface AppleEmbeddingOptions {
  language?: string
}

class AppleTextEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = 'v3'
  readonly provider = 'apple'

  readonly modelId: string = 'NLContextualEmbedding'
  readonly maxEmbeddingsPerCall = Infinity
  readonly supportsParallelCalls = false

  private prepared = false
  private language: string

  constructor(options: AppleEmbeddingOptions = {}) {
    this.language = options.language ?? NativeAppleUtils.getCurrentLocale()
  }

  async prepare(): Promise<void> {
    await NativeAppleEmbeddings.prepare(this.language)
    this.prepared = true
  }

  async doEmbed(
    options: EmbeddingModelV3CallOptions
  ): Promise<EmbeddingModelV3Result> {
    if (!this.prepared) {
      console.warn(
        '[apple-llm] Model not prepared. Call prepare() ahead of time to optimize performance.'
      )
      await this.prepare()
    }

    const embeddings = await NativeAppleEmbeddings.generateEmbeddings(
      options.values,
      this.language
    )
    return {
      embeddings,
      warnings: [],
    }
  }
}

class AppleLLMChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3'
  readonly supportedUrls = {}

  readonly provider = 'apple'
  readonly modelId = 'system-default'

  private tools: ToolSet

  constructor(tools: ToolSet = {}) {
    this.tools = tools
  }

  async prepare(): Promise<void> {}

  private prepareMessages(messages: LanguageModelV3Prompt): AppleMessage[] {
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
            return toolDefinition.execute?.(toolCallArguments, opts)
          },
        }
      }
      throw new Error('Unsupported tool type')
    })
  }

  async doGenerate(options: LanguageModelV3CallOptions) {
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
      delete globalThis.__APPLE_LLM_TOOLS__[tool.id]
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
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage: {
        inputTokens: {
          total: 0,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 0,
          text: undefined,
          reasoning: undefined,
        },
      },
      warnings: [],
    }
  }

  async doStream(options: LanguageModelV3CallOptions) {
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
        delete globalThis.__APPLE_LLM_TOOLS__[tool.id]
      }
    }

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
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
                finishReason: { unified: 'stop' as const, raw: 'stop' },
                usage: {
                  inputTokens: {
                    total: 0,
                    noCache: undefined,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: {
                    total: 0,
                    text: undefined,
                    reasoning: undefined,
                  },
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
