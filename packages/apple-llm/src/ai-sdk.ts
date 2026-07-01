import type {
  EmbeddingModelV3,
  EmbeddingModelV3CallOptions,
  EmbeddingModelV3Result,
  ImageModelV3,
  ImageModelV3CallOptions,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3Message,
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
  Tool as FullToolDefinition,
  ToolCallOptions,
} from '@ai-sdk/provider-utils'

import { createAppleLLMError, isAppleLLMErrorCode } from './errors'
import NativeAppleEmbeddings from './NativeAppleEmbeddings'
import NativeAppleLLM, { type AppleMessage } from './NativeAppleLLM'
import NativeAppleSpeech from './NativeAppleSpeech'
import NativeAppleTranscription from './NativeAppleTranscription'
import NativeAppleUtils from './NativeAppleUtils'

type Tool = LanguageModelV3FunctionTool | LanguageModelV3ProviderTool
export type AppleToolDefinitionSet = Record<string, FullToolDefinition>

export interface AppleLanguageModel extends LanguageModelV3 {
  prepare: () => Promise<void>
  updateTools: (tools: AppleToolDefinitionSet) => void
}
export type AppleLanguageModelId = 'system' | 'private-cloud-compute'
export type AppleBuiltInTool = 'ocr' | 'barcode'
export type AppleImageStyle =
  | 'animation'
  | 'any'
  | 'emoji'
  | 'externalProvider'
  | 'illustration'
  | 'sketch'
export type AppleImagePersonalization = 'automatic' | 'disabled' | 'enabled'

export interface AppleProviderOptions {
  model?: AppleLanguageModelId
  builtInTools?: AppleBuiltInTool[]
  style?: AppleImageStyle
  personalization?: AppleImagePersonalization
}

export interface AppleModelInfo {
  model: AppleLanguageModelId
  isAvailable: boolean
  availability: string
  supportsLocale: boolean
  supportedLanguages: string[]
  supportsTokenCounting: boolean
  supportsImagePrompts: boolean
  supportsPrivateCloudCompute: boolean
  supportsDynamicProfiles: boolean
  supportsVisionTools: boolean
  contextSize?: number
  quotaUsage?: string
}

export interface AppleLanguageModelOptions {
  model?: AppleLanguageModelId
  availableTools?: AppleToolDefinitionSet
}

type AppleMessageAttachment = {
  type: 'image'
  mediaType: string
  data?: string
  url?: string
}

type AppleImageModelFile = {
  mediaType: string
  data: string
}

type AppleMessageContentPart = Extract<
  LanguageModelV3Message['content'],
  readonly unknown[]
>[number]

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function prepareImageAttachment(
  part: Extract<
    Extract<
      LanguageModelV3Prompt[number],
      { content: unknown[] }
    >['content'][number],
    { type: 'file' }
  >
): AppleMessageAttachment {
  const mediaType = part.mediaType.toLowerCase()
  if (!mediaType.startsWith('image/')) {
    throw new Error(
      `Unsupported Apple Foundation Models file type: ${part.mediaType}`
    )
  }

  const data = part.data as unknown

  if (data instanceof Uint8Array) {
    return {
      type: 'image',
      mediaType,
      data: uint8ArrayToBase64(data),
    }
  }

  const value =
    data instanceof URL
      ? data.toString()
      : typeof data === 'string'
        ? data
        : null

  if (!value) {
    throw new Error('Unsupported Apple Foundation Models image data')
  }

  if (value.startsWith('data:')) {
    return {
      type: 'image',
      mediaType,
      data: value,
    }
  }

  return {
    type: 'image',
    mediaType,
    url: value,
  }
}

function prepareImageModelFiles(
  files: ImageModelV3CallOptions['files'] = []
): AppleImageModelFile[] {
  return files.map((file) => {
    if (file.type === 'url') {
      const url = file.url.toString()

      if (url.startsWith('http://') || url.startsWith('https://')) {
        throw new Error(
          'Remote Apple Image Playground file URLs are not supported. Provide image data, a data URL, or a local file URL instead.'
        )
      }

      if (
        !url.startsWith('data:') &&
        !url.startsWith('file://') &&
        !url.startsWith('/')
      ) {
        throw new Error(
          'Unsupported Apple Image Playground file URL. Provide image data, a data URL, or a local file URL instead.'
        )
      }

      return {
        mediaType: getImageModelFileUrlMediaType(url),
        data: url,
      }
    }

    const mediaType = file.mediaType.toLowerCase()
    if (!mediaType.startsWith('image/')) {
      throw new Error(
        `Unsupported Apple Image Playground file type: ${file.mediaType}`
      )
    }

    const data = file.data as unknown
    const normalizedData =
      data instanceof Uint8Array
        ? uint8ArrayToBase64(data)
        : data instanceof URL
          ? data.toString()
          : typeof data === 'string'
            ? data
            : null

    if (!normalizedData) {
      throw new Error('Unsupported Apple Image Playground image data')
    }

    return {
      mediaType,
      data: normalizedData,
    }
  })
}

function getImageModelFileUrlMediaType(url: string) {
  if (!url.startsWith('data:')) {
    return 'image/png'
  }

  const [, mediaType] = /^data:([^;,]+)/.exec(url) ?? []
  return mediaType?.toLowerCase() ?? 'image/png'
}

function getAppleProviderOptions(
  providerOptions: LanguageModelV3CallOptions['providerOptions'] | undefined
): AppleProviderOptions {
  return (providerOptions?.apple ?? {}) as AppleProviderOptions
}

function mergeAppleProviderOptions(
  defaults: AppleLanguageModelOptions,
  callOptions: AppleProviderOptions
): AppleProviderOptions {
  return {
    model: callOptions.model ?? defaults.model,
    builtInTools: callOptions.builtInTools,
  }
}

function serializeKnownMessageContentPart(
  part: AppleMessageContentPart
): string | undefined {
  if (part.type === 'text') {
    return part.text
  }

  if (part.type === 'file') {
    return `[file:${part.mediaType}]`
  }

  if (part.type === 'tool-call') {
    return `[tool-call:${part.toolName}] ${JSON.stringify(part.input)}`
  }

  if (part.type === 'tool-result') {
    return `[tool-result:${part.toolName}] ${JSON.stringify(part.output)}`
  }
}

function appendMessageContent(content: string, addition: string) {
  if (!addition) {
    return content
  }

  return content ? `${content}\n${addition}` : addition
}

export function createAppleProvider({
  availableTools,
  model,
}: AppleLanguageModelOptions = {}) {
  const createLanguageModel = (
    options: AppleLanguageModelOptions = {}
  ): AppleLanguageModel => {
    return new AppleLLMChatLanguageModel({
      availableTools: options.availableTools ?? availableTools,
      model: options.model ?? model,
    })
  }
  const provider = function (options: AppleLanguageModelOptions = {}) {
    return createLanguageModel(options)
  }
  provider.isAvailable = () => NativeAppleLLM.isAvailable()
  provider.getModelInfo = (options: { locale?: string; model?: string } = {}) =>
    NativeAppleLLM.getModelInfo(
      options.locale,
      options.model
    ) as Promise<AppleModelInfo>
  provider.languageModel = createLanguageModel
  provider.textEmbeddingModel = (options: AppleEmbeddingOptions = {}) => {
    return new AppleTextEmbeddingModel(options)
  }
  provider.imageModel = (options: AppleImageModelOptions = {}) => {
    return new AppleImageModel(options)
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

export interface AppleImageModelOptions {
  style?: AppleImageStyle
  personalization?: AppleImagePersonalization
}

class AppleImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3'
  readonly provider = 'apple'
  readonly modelId = 'ImagePlayground'
  readonly maxImagesPerCall = 4

  private options: AppleImageModelOptions

  constructor(options: AppleImageModelOptions = {}) {
    this.options = options
  }

  async doGenerate(options: ImageModelV3CallOptions) {
    const appleOptions = (options.providerOptions?.apple ??
      {}) as AppleImageModelOptions
    const images = await NativeAppleLLM.generateImages({
      prompt: options.prompt,
      n: options.n,
      files: prepareImageModelFiles(options.files),
      style: appleOptions.style ?? this.options.style,
      personalization:
        appleOptions.personalization ?? this.options.personalization,
    })

    return {
      images,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    }
  }
}

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

  isAvailable(): boolean {
    return NativeAppleTranscription.isAvailable(this.language)
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

class AppleLLMChatLanguageModel implements AppleLanguageModel {
  readonly specificationVersion = 'v3'
  readonly supportedUrls = {}

  readonly provider = 'apple'
  readonly modelId: string

  private tools: AppleToolDefinitionSet = {}
  private options: AppleLanguageModelOptions

  constructor(options: AppleLanguageModelOptions = {}) {
    this.options = options
    this.modelId = options.model ?? 'system'
    this.updateTools(options.availableTools ?? {})
  }

  async prepare(): Promise<void> {}

  private prepareMessages(messages: LanguageModelV3Prompt): AppleMessage[] {
    return messages.map((message): AppleMessage => {
      if (Array.isArray(message.content)) {
        const attachments: AppleMessageAttachment[] = []
        const content = message.content.reduce((acc, part) => {
          if (part.type === 'file') {
            attachments.push(prepareImageAttachment(part))
            return acc
          }

          const serializedPart = serializeKnownMessageContentPart(part)
          if (serializedPart !== undefined) {
            return appendMessageContent(acc, serializedPart)
          }

          throw new Error(
            `Unsupported Apple Foundation Models message content type: ${JSON.stringify(part)}`
          )
        }, '')

        return {
          role: message.role,
          content,
          attachments,
        }
      }

      return {
        role: message.role,
        content: message.content,
      }
    })
  }

  private prepareTools(tools: Tool[] = []) {
    return tools.map((tool) => {
      if (tool.type === 'function') {
        const schema = jsonSchema(tool.inputSchema)
        return {
          ...tool,
          id: generateId(),
          execute: async (modelInput: unknown) => {
            const text =
              typeof modelInput === 'string'
                ? modelInput
                : JSON.stringify(modelInput ?? '')
            const toolCallArguments = await parseJSON({
              text,
              schema,
            })
            const opts: ToolCallOptions = {
              toolCallId: generateId(),
              messages: [],
            }
            return this.tools[tool.name].execute?.(toolCallArguments, opts)
          },
        }
      }
      throw new Error('Unsupported tool type')
    })
  }

  updateTools(tools: AppleToolDefinitionSet) {
    this.tools = tools
  }

  async doGenerate(options: LanguageModelV3CallOptions) {
    const appleOptions = mergeAppleProviderOptions(
      this.options,
      getAppleProviderOptions(options.providerOptions)
    )
    const messages = this.prepareMessages(options.prompt)
    const tools = this.prepareTools(options.tools)

    for (const tool of tools) {
      globalThis.__APPLE_LLM_TOOLS__[tool.id] = tool.execute
    }

    try {
      const response = await NativeAppleLLM.generateText(messages, {
        maxTokens: options.maxOutputTokens,
        temperature: options.temperature,
        topP: options.topP,
        topK: options.topK,
        tools,
        providerOptions: appleOptions as unknown as Record<string, unknown>,
        schema:
          options.responseFormat?.type === 'json'
            ? options.responseFormat.schema
            : undefined,
      })

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
        warnings: [],
      }
    } finally {
      for (const tool of tools) {
        delete globalThis.__APPLE_LLM_TOOLS__[tool.id]
      }
    }
  }

  async doStream(options: LanguageModelV3CallOptions) {
    const appleOptions = mergeAppleProviderOptions(
      this.options,
      getAppleProviderOptions(options.providerOptions)
    )
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
          streamId = generateId()

          controller.enqueue({
            type: 'text-start',
            id: streamId,
          })

          let previousRawContent = ''

          const updateListener = NativeAppleLLM.onStreamUpdate((data) => {
            if (data.streamId === streamId) {
              const nextRawContent = String(data.content ?? '')
              const rawDelta = nextRawContent.startsWith(previousRawContent)
                ? nextRawContent.slice(previousRawContent.length)
                : nextRawContent
              previousRawContent = nextRawContent

              // Apple native streaming can emit bogus "null" chunks as text.
              if (rawDelta === 'null') return

              controller.enqueue({
                type: 'text-delta',
                delta: rawDelta,
                id: data.streamId,
              })
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
                error: isAppleLLMErrorCode(data.code)
                  ? createAppleLLMError(data.error, data.code)
                  : new Error(data.error),
              })
              cleanup()
              controller.close()
            }
          })

          listeners = [updateListener, completeListener, errorListener]

          NativeAppleLLM.generateStream(streamId, messages, {
            maxTokens: options.maxOutputTokens,
            temperature: options.temperature,
            topP: options.topP,
            topK: options.topK,
            tools,
            providerOptions: appleOptions as unknown as Record<string, unknown>,
            schema,
          })
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
