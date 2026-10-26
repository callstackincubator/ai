import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  EmbeddingModelV4Result,
  ImageModelV4,
  ImageModelV4CallOptions,
  JSONSchema7,
  JSONSchema7Definition,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4FunctionTool,
  LanguageModelV4Message,
  LanguageModelV4Prompt,
  LanguageModelV4ProviderTool,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolResultOutput,
  LanguageModelV4Usage,
  SharedV4Warning,
  SpeechModelV4,
  SpeechModelV4CallOptions,
  TranscriptionModelV4,
  TranscriptionModelV4CallOptions,
} from '@ai-sdk/provider'
import {
  generateId,
  jsonSchema,
  parseJSON,
  Tool as FullToolDefinition,
  ToolExecutionOptions,
} from '@ai-sdk/provider-utils'

import { createAppleLLMError, isAppleLLMErrorCode } from './errors'
import NativeAppleEmbeddings from './NativeAppleEmbeddings'
import NativeAppleLLM, {
  type AppleMessage,
  type AppleUsage,
} from './NativeAppleLLM'
import NativeAppleSpeech from './NativeAppleSpeech'
import NativeAppleTranscription from './NativeAppleTranscription'
import NativeAppleUtils from './NativeAppleUtils'

type Tool = LanguageModelV4FunctionTool | LanguageModelV4ProviderTool
export type AppleToolDefinitionSet = Record<string, FullToolDefinition>

export interface AppleLanguageModel extends LanguageModelV4 {
  prepare: () => Promise<void>
  updateTools: (tools: AppleToolDefinitionSet) => void
  /**
   * Counts tokens in text with the on-device model's tokenizer (iOS 26.4+).
   * Private Cloud Compute has no token counting API, so Private Cloud Compute
   * models also count with the on-device tokenizer, which may not match
   */
  countTokens: (text: string) => Promise<number>
}
export type AppleLanguageModelId = 'system' | 'private-cloud-compute'
export type AppleBuiltInTool = 'ocr' | 'barcode' | 'spotlight'
// 'any', 'emoji' and 'externalProvider' need iOS 27, which has no ImageCreator,
// so they fall back to 'illustration'
export type AppleImageStyle =
  | 'animation'
  | 'any'
  | 'emoji'
  | 'externalProvider'
  | 'illustration'
  | 'sketch'
export type AppleImagePersonalization = 'automatic' | 'disabled' | 'enabled'
export type AppleReasoningLevel = 'light' | 'moderate' | 'deep'
export type AppleGuardrails = 'default' | 'permissiveContentTransformations'
// contentTagging runs the on-device model with Apple's adapter for tagging,
// entity extraction and topic detection
export type AppleUseCase = 'general' | 'contentTagging'

export interface AppleProviderOptions {
  builtInTools?: AppleBuiltInTool[]
  // Most tool calls Apple runs in one generation, across all tools. Needs iOS 27
  maxToolCalls?: number
  style?: AppleImageStyle
  personalization?: AppleImagePersonalization
}

export type AppleModelAvailability =
  | 'available'
  | 'deviceNotEligible'
  | 'appleIntelligenceNotEnabled'
  | 'modelNotReady'
  | 'systemNotReady'
  | 'missingEntitlement'
  | 'unknown'

export interface AppleModelInfo {
  model: AppleLanguageModelId
  availability: AppleModelAvailability
  supportsLocale: boolean
  supportedLanguages: string[]
  supportsTokenCounting: boolean
  supportsImagePrompts: boolean
  supportsDynamicProfiles: boolean
  supportsVisionTools: boolean
  supportsSpotlightTool: boolean
  supportsReasoning: boolean
  contextSize?: number
}

export interface AppleLanguageModelOptions {
  model?: AppleLanguageModelId
  availableTools?: AppleToolDefinitionSet
  guardrails?: AppleGuardrails
  // Applies to the on-device system model only
  useCase?: AppleUseCase
}

type AppleMessageAttachment = {
  type: 'image'
  mediaType: string
  data?: string
  url?: string
  label?: string
}

type AppleImageModelFile = {
  mediaType: string
  data: string
}

type AppleImageSource =
  | {
      type: 'data'
      value: string
    }
  | {
      type: 'url'
      value: string
    }

type AppleMessageContentPart = Extract<
  LanguageModelV4Message['content'],
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

function normalizeAppleImageSource(
  data: unknown,
  featureName: string
): AppleImageSource {
  if (data instanceof Uint8Array) {
    return {
      type: 'data',
      value: uint8ArrayToBase64(data),
    }
  }

  const value =
    data instanceof URL
      ? data.toString()
      : typeof data === 'string'
        ? data
        : null

  if (!value) {
    throw new Error(`Unsupported ${featureName} image data`)
  }

  const lowerValue = value.toLowerCase()

  if (lowerValue.startsWith('http://') || lowerValue.startsWith('https://')) {
    throw new Error(
      `Remote ${featureName} image URLs are not supported. Provide image data, a data URL, or a local file URL instead.`
    )
  }

  if (lowerValue.startsWith('data:')) {
    return {
      type: 'data',
      value,
    }
  }

  if (lowerValue.startsWith('file://') || value.startsWith('/')) {
    return {
      type: 'url',
      value,
    }
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    throw new Error(
      `Unsupported ${featureName} image URL. Provide image data, a data URL, or a local file URL instead.`
    )
  }

  return {
    type: 'data',
    value,
  }
}

function prepareImageAttachment(
  part: Extract<
    Extract<
      LanguageModelV4Prompt[number],
      { content: unknown[] }
    >['content'][number],
    { type: 'file' }
  >,
  index: number
): AppleMessageAttachment {
  const mediaType = part.mediaType.toLowerCase()
  if (mediaType !== 'image' && !mediaType.startsWith('image/')) {
    throw new Error(
      `Unsupported Apple Foundation Models file type: ${part.mediaType}`
    )
  }

  const source = normalizeAppleImageSource(
    part.data.type === 'data'
      ? part.data.data
      : part.data.type === 'url'
        ? part.data.url
        : undefined,
    'Apple Foundation Models'
  )

  // The label is how the model and Vision tools name the image, so images
  // without a filename still need one
  const label = part.filename ?? `image-${index + 1}`

  if (source.type === 'data') {
    return {
      type: 'image',
      mediaType,
      data: source.value,
      label,
    }
  }

  return {
    type: 'image',
    mediaType,
    url: source.value,
    label,
  }
}

function prepareImageModelFiles(
  files: ImageModelV4CallOptions['files'] = []
): AppleImageModelFile[] {
  return files.map((file) => {
    if (file.type === 'url') {
      const source = normalizeAppleImageSource(
        file.url,
        'Apple Image Playground'
      )

      return {
        mediaType: getImageModelFileUrlMediaType(source.value),
        data: source.value,
      }
    }

    const mediaType = file.mediaType.toLowerCase()
    if (!mediaType.startsWith('image/')) {
      throw new Error(
        `Unsupported Apple Image Playground file type: ${file.mediaType}`
      )
    }

    const source = normalizeAppleImageSource(
      file.data as unknown,
      'Apple Image Playground'
    )

    return {
      mediaType,
      data: source.value,
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

// Options read by the native module. The model comes from the language model
// instance and the reasoning level from the AI SDK `reasoning` call option
interface AppleNativeOptions {
  // Lets cancelStream() stop a non-streaming generation
  requestId?: string
  model?: AppleLanguageModelId
  guardrails?: AppleGuardrails
  useCase?: AppleUseCase
  reasoningLevel?: AppleReasoningLevel
  builtInTools?: AppleBuiltInTool[]
  maxToolCalls?: number
}

function getAppleNativeOptions(
  defaults: AppleLanguageModelOptions,
  options: LanguageModelV4CallOptions
): AppleNativeOptions {
  const appleOptions = (options.providerOptions?.apple ??
    {}) as AppleProviderOptions

  return {
    model: defaults.model,
    guardrails: defaults.guardrails,
    useCase: defaults.useCase,
    reasoningLevel: toAppleReasoningLevel(options.reasoning),
    // A named tool choice only offers that tool
    builtInTools:
      options.toolChoice?.type === 'tool'
        ? undefined
        : appleOptions.builtInTools,
    maxToolCalls: appleOptions.maxToolCalls,
  }
}

export function toAppleReasoningLevel(
  reasoning: LanguageModelV4CallOptions['reasoning']
): AppleReasoningLevel | undefined {
  switch (reasoning) {
    case 'minimal':
    case 'low':
      return 'light'
    case 'medium':
      return 'moderate'
    case 'high':
    case 'xhigh':
    case 'max':
      return 'deep'
    default:
      // 'provider-default' and 'none' keep Apple's default behavior
      return undefined
  }
}

// Call settings Foundation Models has no equivalent for
function getUnsupportedSettingWarnings(
  options: LanguageModelV4CallOptions
): SharedV4Warning[] {
  const unsupported = [
    options.stopSequences?.length ? 'stopSequences' : undefined,
    options.presencePenalty !== undefined ? 'presencePenalty' : undefined,
    options.frequencyPenalty !== undefined ? 'frequencyPenalty' : undefined,
  ]
  const warnings: SharedV4Warning[] = unsupported.flatMap((feature) =>
    feature ? [{ type: 'unsupported' as const, feature }] : []
  )
  if (options.seed !== undefined && !isNativeSeed(options.seed)) {
    warnings.push({
      type: 'unsupported',
      feature: 'seed',
      details: 'Foundation Models seeds are whole numbers, so it was left out.',
    })
  }
  return warnings
}

// Native seeds are UInt64, so other numbers would be changed instead of used
function isNativeSeed(seed: number | undefined): seed is number {
  return Number.isSafeInteger(seed) && seed! >= 0
}

/**
 * Rejects as soon as the call is aborted and cancels the native generation,
 * which would otherwise keep running to the end
 */
function abortable<T>(
  promise: Promise<T>,
  abortSignal: AbortSignal | undefined,
  cancel: () => void
): Promise<T> {
  if (!abortSignal) {
    return promise
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cancel()
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      reject(abortSignal.reason instanceof Error ? abortSignal.reason : error)
    }
    // Handles the native promise even when aborted, so its rejection is not unhandled
    promise
      .then(resolve, reject)
      .finally(() => abortSignal.removeEventListener('abort', onAbort))
    if (abortSignal.aborted) {
      onAbort()
      return
    }
    abortSignal.addEventListener('abort', onAbort, { once: true })
  })
}

type AppleMessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string; signature?: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: string }
  | {
      type: 'tool-result'
      toolCallId: string
      toolName: string
      output: string
    }

function serializeToolResultOutput(
  output: LanguageModelV4ToolResultOutput
): string {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value)
    case 'execution-denied':
      return output.reason ?? 'Tool execution denied'
    case 'content':
      return output.value
        .map((item) => {
          if (item.type === 'text') {
            return item.text
          }
          return item.type === 'file' ? `[file:${item.mediaType}]` : ''
        })
        .filter(Boolean)
        .join('\n')
  }
}

/**
 * Converts assistant and tool message content into parts that are replayed
 * natively as Foundation Models transcript entries.
 */
function toAppleMessageParts(
  part: AppleMessageContentPart
): AppleMessagePart[] {
  switch (part.type) {
    case 'text':
      return [{ type: 'text', text: part.text }]
    case 'file':
      return [{ type: 'text', text: `[file:${part.mediaType}]` }]
    case 'reasoning': {
      // Only reasoning generated by Apple models is replayed
      const appleOptions = part.providerOptions?.apple
      if (!appleOptions) {
        return []
      }
      return [
        {
          type: 'reasoning',
          text: part.text,
          ...(typeof appleOptions.signature === 'string'
            ? { signature: appleOptions.signature }
            : {}),
        },
      ]
    }
    case 'tool-call':
      return [
        {
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input:
            typeof part.input === 'string'
              ? part.input
              : JSON.stringify(part.input ?? {}),
        },
      ]
    case 'tool-result':
      return [
        {
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: serializeToolResultOutput(part.output),
        },
      ]
    default:
      // Reasoning files, custom parts and tool approval responses have no
      // transcript equivalent
      return []
  }
}

export type AppleStreamEntry =
  | { type: 'reasoning'; id: string; text: string; signature?: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: string }
  | {
      type: 'tool-result'
      toolCallId: string
      toolName: string
      output: string
    }

// Foundation Models cannot constrain a number to a single fractional value, so
// enums with fractional numbers are generated as strings and parsed back
function isFractionalEnum(schema: unknown) {
  const { type, enum: values } = (schema ?? {}) as JSONSchema7
  return (
    type === 'number' &&
    values?.some((value) => !Number.isInteger(value)) === true
  )
}

// Foundation Models generates properties in order, but native receives objects
// as dictionaries, which have none, so the order is sent as a list
function withPropertyOrder(key: string, value: JSONSchema7) {
  // Like the native parser, objects can leave out their type or be nullable.
  // The values of a properties map are schemas, but the map itself is not
  const isObject =
    value?.type === undefined ||
    value.type === 'object' ||
    (Array.isArray(value.type) && value.type.includes('object'))
  return key !== 'properties' && isObject && value?.properties
    ? { ...value, 'x-order': Object.keys(value.properties) }
    : value
}

function toNativeSchema<T extends JSONSchema7 | undefined>(schema: T): T {
  return (
    schema &&
    JSON.parse(
      JSON.stringify(schema, (key, value) =>
        isFractionalEnum(value)
          ? { ...value, type: 'string', enum: value.enum!.map(String) }
          : withPropertyOrder(key, value)
      )
    )
  )
}

function restoreNumbers(
  value: unknown,
  schema?: JSONSchema7Definition
): unknown {
  if (typeof schema !== 'object') {
    return value
  }
  if (isFractionalEnum(schema)) {
    return schema.enum!.map(String).includes(value as string)
      ? Number(value)
      : value
  }
  if (Array.isArray(value) && schema.items) {
    return value.map((item) =>
      restoreNumbers(item, schema.items as JSONSchema7Definition)
    )
  }
  if (value && typeof value === 'object' && schema.properties) {
    // Foundation Models generates properties in schema order, but its JSON
    // does not keep that order, so it is restored here too
    const order = Object.keys(schema.properties)
    const rank = (key: string) =>
      order.includes(key) ? order.indexOf(key) : order.length
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => rank(a) - rank(b))
        .map(([key, item]) => [
          key,
          restoreNumbers(item, schema.properties![key]),
        ])
    )
  }
  return (schema.anyOf ?? []).reduce(restoreNumbers, value)
}

function restoreJsonNumbers(text: string, schema?: JSONSchema7) {
  try {
    return JSON.stringify(restoreNumbers(JSON.parse(text), schema))
  } catch {
    return text
  }
}

function restoreToolInput(tools: Tool[] = [], name: string, input: string) {
  const tool = tools.find((tool) => tool.name === name)
  return tool?.type === 'function'
    ? restoreJsonNumbers(input, tool.inputSchema)
    : input
}

// Native streams send the full text generated so far
export function getSnapshotDelta(previous: string, next: string) {
  return next.startsWith(previous) ? next.slice(previous.length) : next
}

/**
 * Turns Foundation Models stream snapshots (the response text so far, plus the
 * reasoning and tool entries so far) into AI SDK stream parts. Shared with
 * @react-native-ai/core-ai, whose models stream through the same
 * LanguageModelSession
 *
 * @param providerKey Key of the provider metadata on reasoning parts
 * @param schema Schema of structured output. The text is held back and sent in
 * end(), since partial JSON snapshots are not prefixes of the final JSON
 * @param tools Tools of the call, to restore the numbers in their inputs
 */
export function createSnapshotStreamHandler(
  controller: ReadableStreamDefaultController<LanguageModelV4StreamPart>,
  id: string,
  providerKey: string,
  { schema, tools }: { schema?: JSONSchema7; tools?: Tool[] } = {}
) {
  let previousRawContent = ''
  let textStarted = false
  // Reasoning text so far by entry id, and the signature of open blocks
  const reasoningTexts = new Map<string, string>()
  const openReasoning = new Map<string, string | undefined>()
  const emittedToolResults = new Set<string>()

  const endReasoning = () => {
    for (const [reasoningId, signature] of openReasoning) {
      controller.enqueue({
        type: 'reasoning-end',
        id: reasoningId,
        providerMetadata: {
          [providerKey]: signature ? { signature } : {},
        },
      })
    }
    openReasoning.clear()
  }

  const handleEntries = (entries: AppleStreamEntry[]) => {
    for (const entry of entries) {
      if (entry.type === 'reasoning') {
        const previousText = reasoningTexts.get(entry.id)
        if (previousText === undefined) {
          controller.enqueue({ type: 'reasoning-start', id: entry.id })
          openReasoning.set(entry.id, undefined)
        } else if (!openReasoning.has(entry.id)) {
          continue
        }

        openReasoning.set(
          entry.id,
          entry.signature ?? openReasoning.get(entry.id)
        )
        reasoningTexts.set(entry.id, entry.text)

        const delta = getSnapshotDelta(previousText ?? '', entry.text)
        if (delta) {
          controller.enqueue({
            type: 'reasoning-delta',
            id: entry.id,
            delta,
          })
        }
      }

      // Tools run natively, so calls are reported once their output exists
      if (
        entry.type === 'tool-result' &&
        !emittedToolResults.has(entry.toolCallId)
      ) {
        const toolCall = entries.find(
          (candidate) =>
            candidate.type === 'tool-call' &&
            candidate.toolCallId === entry.toolCallId
        )

        endReasoning()
        controller.enqueue({
          type: 'tool-call',
          toolCallId: entry.toolCallId,
          toolName: entry.toolName,
          input:
            toolCall?.type === 'tool-call'
              ? restoreToolInput(tools, entry.toolName, toolCall.input)
              : '{}',
          providerExecuted: true,
        })
        controller.enqueue({
          type: 'tool-result',
          toolCallId: entry.toolCallId,
          toolName: entry.toolName,
          result: entry.output,
        })
        emittedToolResults.add(entry.toolCallId)
      }
    }
  }

  return {
    update(content: string, entries?: AppleStreamEntry[]) {
      if (entries) {
        handleEntries(entries)
      }

      if (schema) {
        previousRawContent = content
        return
      }

      const rawDelta = getSnapshotDelta(previousRawContent, content)
      previousRawContent = content

      // Apple native streaming can emit bogus "null" chunks as text.
      if (!rawDelta || rawDelta === 'null') return

      if (!textStarted) {
        endReasoning()
        controller.enqueue({ type: 'text-start', id })
        textStarted = true
      }

      controller.enqueue({
        type: 'text-delta',
        delta: rawDelta,
        id,
      })
    },
    /**
     * @param flushHeldText Whether to send the held back structured output. A
     * filtered response leaves it out, like doGenerate does
     */
    end({ flushHeldText = true }: { flushHeldText?: boolean } = {}) {
      endReasoning()
      if (schema && previousRawContent && flushHeldText) {
        controller.enqueue({ type: 'text-start', id })
        controller.enqueue({
          type: 'text-delta',
          delta: restoreJsonNumbers(previousRawContent, schema),
          id,
        })
        textStarted = true
      }
      if (textStarted) {
        controller.enqueue({ type: 'text-end', id })
      }
    },
  }
}

function prepareToolChoice(
  tools: Tool[] = [],
  toolChoice: LanguageModelV4CallOptions['toolChoice']
): {
  tools: Tool[]
  toolCallingMode?: 'disallowed' | 'required'
} {
  switch (toolChoice?.type) {
    case 'none':
      // Also disables built-in tools on iOS 27
      return { tools: [], toolCallingMode: 'disallowed' }
    case 'required':
      // Required until the model calls a tool, then it can answer. Needs iOS 27
      return { tools, toolCallingMode: 'required' }
    case 'tool':
      return {
        tools: tools.filter((tool) => tool.name === toolChoice.toolName),
        toolCallingMode: 'required',
      }
    default:
      return { tools }
  }
}

function toUsage(usage: AppleUsage | undefined): LanguageModelV4Usage {
  const cachedInputTokens = usage?.cachedInputTokens
  const reasoningTokens = usage?.reasoningTokens
  return {
    inputTokens: {
      total: usage?.inputTokens,
      noCache:
        usage && cachedInputTokens !== undefined
          ? usage.inputTokens - cachedInputTokens
          : undefined,
      cacheRead: cachedInputTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage?.outputTokens,
      text:
        usage && reasoningTokens !== undefined
          ? usage.outputTokens - reasoningTokens
          : undefined,
      reasoning: reasoningTokens,
    },
  }
}

// Guardrail violations and refusals end the response like other providers'
// content filters, instead of failing the call
function isContentFilterError(code: unknown) {
  return code === 'GUARDRAIL_VIOLATION' || code === 'REFUSAL'
}

function toContentFilterFinishReason(
  code: string
): LanguageModelV4FinishReason {
  return { unified: 'content-filter', raw: code }
}

// Foundation Models stops at maxOutputTokens without saying so, so a response
// that used every allowed token is reported as cut off
function toFinishReason(
  usage: AppleUsage | undefined,
  maxOutputTokens: number | undefined
): LanguageModelV4FinishReason {
  if (
    usage &&
    maxOutputTokens !== undefined &&
    usage.outputTokens >= maxOutputTokens
  ) {
    return { unified: 'length', raw: undefined }
  }
  return { unified: 'stop', raw: 'stop' }
}

function appendMessageContent(content: string, addition: string) {
  if (!addition) {
    return content
  }

  return content ? `${content}\n${addition}` : addition
}

/**
 * Converts an AI SDK prompt into messages that are replayed natively as a
 * Foundation Models transcript. Shared with @react-native-ai/core-ai
 */
export function prepareAppleMessages(
  messages: LanguageModelV4Prompt
): AppleMessage[] {
  return messages.map((message, index): AppleMessage => {
    switch (message.role) {
      case 'system':
        return {
          role: message.role,
          content: message.content,
        }
      case 'user': {
        const attachments: AppleMessageAttachment[] = []
        // Foundation Models only accept images on the prompt being answered,
        // so images from earlier turns are left out of the transcript
        const isFinalPrompt = index === messages.length - 1
        const content = message.content.reduce((acc, part) => {
          if (part.type === 'file') {
            if (isFinalPrompt) {
              attachments.push(prepareImageAttachment(part, attachments.length))
            }
            return acc
          }
          return appendMessageContent(acc, part.text)
        }, '')

        return {
          role: message.role,
          content,
          attachments,
        }
      }
      default: {
        const parts = message.content.flatMap(toAppleMessageParts)

        return {
          role: message.role,
          content: parts
            .flatMap((part) => (part.type === 'text' ? [part.text] : []))
            .join('\n'),
          parts,
        }
      }
    }
  })
}

export function createAppleProvider({
  availableTools,
  model,
  guardrails,
  useCase,
}: AppleLanguageModelOptions = {}) {
  const createLanguageModel = (
    options: AppleLanguageModelId | AppleLanguageModelOptions = {}
  ): AppleLanguageModel => {
    const modelOptions =
      typeof options === 'string' ? { model: options } : options
    return new AppleLLMChatLanguageModel({
      availableTools: modelOptions.availableTools ?? availableTools,
      model: modelOptions.model ?? model,
      guardrails: modelOptions.guardrails ?? guardrails,
      useCase: modelOptions.useCase ?? useCase,
    })
  }
  const provider = function (
    options: AppleLanguageModelId | AppleLanguageModelOptions = {}
  ) {
    return createLanguageModel(options)
  }
  provider.specificationVersion = 'v4' as const
  provider.isAvailable = () => NativeAppleLLM.isAvailable()
  provider.getModelInfo = (
    options: { locale?: string; model?: AppleLanguageModelId } = {}
  ) =>
    NativeAppleLLM.getModelInfo(
      options.locale,
      options.model
    ) as Promise<AppleModelInfo>
  provider.languageModel = createLanguageModel
  provider.embeddingModel = (options: AppleEmbeddingOptions = {}) => {
    return new AppleTextEmbeddingModel(options)
  }
  /** @deprecated Use `embeddingModel` */
  provider.textEmbeddingModel = provider.embeddingModel
  /**
   * @deprecated Apple discontinued Image Playground's ImageCreator in iOS 27,
   * where this model throws `UNSUPPORTED_OS`. It will be removed in the next
   * major version. Present `imagePlaygroundSheet` from native code or use
   * another image provider instead
   */
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

class AppleImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'apple'
  readonly modelId = 'ImagePlayground'
  readonly maxImagesPerCall = 4

  private options: AppleImageModelOptions

  constructor(options: AppleImageModelOptions = {}) {
    this.options = options
  }

  async doGenerate(options: ImageModelV4CallOptions) {
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

    // Image Playground picks the size and has no seed
    const warnings: SharedV4Warning[] = [
      options.size !== undefined ? 'size' : undefined,
      options.aspectRatio !== undefined ? 'aspectRatio' : undefined,
      options.seed !== undefined ? 'seed' : undefined,
    ].flatMap((feature) =>
      feature ? [{ type: 'unsupported' as const, feature }] : []
    )

    return {
      images,
      warnings,
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
  // Words and phrases the audio likely contains, such as names or jargon
  contextualStrings?: string[]
}

class AppleTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'apple'

  readonly modelId = 'SpeechTranscriber'

  private prepared = false
  private language: string
  private contextualStrings?: string[]

  constructor(options: AppleTranscriptionOptions = {}) {
    this.language = options.language ?? NativeAppleUtils.getCurrentLocale()
    this.contextualStrings = options.contextualStrings
  }

  isAvailable(): boolean {
    return NativeAppleTranscription.isAvailable(this.language)
  }

  async prepare(): Promise<void> {
    await NativeAppleTranscription.prepare(this.language)
    this.prepared = true
  }

  async doGenerate(options: TranscriptionModelV4CallOptions) {
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

      // A typed array can be a view into a larger buffer, so only its bytes are sent
      const transcriptionResult = await NativeAppleTranscription.transcribe(
        audio.buffer.slice(
          audio.byteOffset,
          audio.byteOffset + audio.byteLength
        ),
        this.language,
        (
          options.providerOptions?.apple as
            | AppleTranscriptionOptions
            | undefined
        )?.contextualStrings ?? this.contextualStrings
      )

      const transcriptionText = transcriptionResult.segments
        .map((segment) => segment.text)
        .join(' ')

      return {
        text: transcriptionText,
        segments: transcriptionResult.segments,
        // The AI SDK reports ISO-639-1 codes, while the locale can be en_US
        language: this.language.split(/[-_]/)[0],
        durationInSeconds: transcriptionResult.duration,
        providerMetadata: {
          apple: { words: transcriptionResult.words },
        },
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

class AppleSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'apple'

  readonly modelId = 'AVSpeechSynthesizer'

  private language: string

  constructor(options: AppleSpeechOptions = {}) {
    this.language = options.language ?? NativeAppleUtils.getCurrentLocale()
  }

  async prepare(): Promise<void> {}

  async doGenerate(options: SpeechModelV4CallOptions) {
    const speechOptions = {
      // 'auto' asks the provider to detect the language, which speech synthesis cannot
      language:
        options.language && options.language !== 'auto'
          ? options.language
          : this.language,
      voice: options.voice,
      speed: options.speed,
    }

    try {
      const audio = await NativeAppleSpeech.generate(
        options.text,
        speechOptions
      )

      // AVSpeechSynthesizer only writes WAV and has no style controls
      const warnings: SharedV4Warning[] = [
        options.outputFormat !== undefined && options.outputFormat !== 'wav'
          ? 'outputFormat'
          : undefined,
        options.instructions !== undefined ? 'instructions' : undefined,
      ].flatMap((feature) =>
        feature ? [{ type: 'unsupported' as const, feature }] : []
      )
      // A voice speaks its own language, so only warn when the language was used
      if (options.language === 'auto' && !options.voice) {
        warnings.push({
          type: 'unsupported',
          feature: 'language',
          details: `Speech synthesis cannot detect the language, so ${this.language} was used.`,
        })
      }

      return {
        audio: new Uint8Array(audio),
        warnings,
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

class AppleTextEmbeddingModel implements EmbeddingModelV4 {
  readonly specificationVersion = 'v4'
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
    options: EmbeddingModelV4CallOptions
  ): Promise<EmbeddingModelV4Result> {
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
  readonly specificationVersion = 'v4'
  // Local and inline images are read natively. Without this, AI SDK 7 tries to
  // download file:// URLs and rejects them
  readonly supportedUrls = {
    'image/*': [/^file:\/\//, /^data:image\//],
  }

  readonly provider = 'apple'
  readonly modelId: string

  private tools: AppleToolDefinitionSet = {}
  private options: AppleLanguageModelOptions
  private reasoningSupport?: Promise<boolean>

  constructor(options: AppleLanguageModelOptions = {}) {
    this.options = options
    this.modelId = options.model ?? 'system'
    this.updateTools(options.availableTools ?? {})
  }

  /**
   * Starts loading the model into memory, so the first generation answers
   * sooner. Resolves once loading has started, not when the model is ready, so
   * call it a little ahead, e.g. when the user opens a chat
   */
  prepare(): Promise<void> {
    return NativeAppleLLM.prewarm({
      model: this.options.model,
      guardrails: this.options.guardrails,
      useCase: this.options.useCase,
    })
  }

  countTokens(text: string): Promise<number> {
    return NativeAppleLLM.countTokens(text)
  }

  // Asked once per model, since reasoning depends on the model and the OS
  private supportsReasoning(): Promise<boolean> {
    this.reasoningSupport ??= NativeAppleLLM.getModelInfo(
      undefined,
      this.modelId
    ).then(
      (info) => (info as AppleModelInfo).supportsReasoning !== false,
      // Older OS versions report the unsupported reasoning level natively
      () => true
    )
    return this.reasoningSupport
  }

  private async prepareCallOptions(options: LanguageModelV4CallOptions) {
    const appleOptions = getAppleNativeOptions(this.options, options)
    const warnings = getUnsupportedSettingWarnings(options)

    // Foundation Models fails the whole call for a reasoning level the model
    // cannot use, so it is dropped with a warning like other unsupported settings
    if (appleOptions.reasoningLevel && !(await this.supportsReasoning())) {
      appleOptions.reasoningLevel = undefined
      warnings.push({
        type: 'unsupported',
        feature: 'reasoning',
        details: `The ${this.modelId} model does not support reasoning.`,
      })
    }

    return { appleOptions, warnings }
  }

  private prepareTools(tools: Tool[] = []) {
    return tools.map((tool) => {
      if (tool.type === 'function') {
        if (!this.tools[tool.name]) {
          throw new Error(
            `Tool "${tool.name}" is not registered with the Apple provider. Apple runs tools natively, so pass it in availableTools of createAppleProvider() or call updateTools() first.`
          )
        }
        const schema = jsonSchema(tool.inputSchema)
        return {
          ...tool,
          inputSchema: toNativeSchema(tool.inputSchema),
          id: generateId(),
          execute: async (modelInput: unknown) => {
            const text =
              typeof modelInput === 'string'
                ? modelInput
                : JSON.stringify(modelInput ?? '')
            const toolCallArguments = await parseJSON({
              text: restoreJsonNumbers(text, tool.inputSchema),
              schema,
            })
            const opts: ToolExecutionOptions<unknown> = {
              toolCallId: generateId(),
              messages: [],
              context: undefined,
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

  async doGenerate(options: LanguageModelV4CallOptions) {
    const { appleOptions, warnings } = await this.prepareCallOptions(options)
    const requestId = generateId()
    const messages = prepareAppleMessages(options.prompt)
    const { tools: callTools, toolCallingMode } = prepareToolChoice(
      options.tools,
      options.toolChoice
    )
    const tools = this.prepareTools(callTools)

    for (const tool of tools) {
      globalThis.__APPLE_LLM_TOOLS__[tool.id] = tool.execute
    }

    const schema =
      options.responseFormat?.type === 'json'
        ? options.responseFormat.schema
        : undefined

    try {
      const response = await abortable(
        NativeAppleLLM.generateText(messages, {
          maxTokens: options.maxOutputTokens,
          temperature: options.temperature,
          topP: options.topP,
          topK: options.topK,
          seed: isNativeSeed(options.seed) ? options.seed : undefined,
          tools,
          toolCallingMode,
          providerOptions: { ...appleOptions, requestId } as Record<
            string,
            unknown
          >,
          schema: toNativeSchema(schema),
        }),
        options.abortSignal,
        () => NativeAppleLLM.cancelStream(requestId)
      ).catch((error) => {
        if (isContentFilterError(error?.code)) {
          return {
            content: [],
            usage: undefined,
            filtered: error.code as string,
          }
        }
        throw error
      })

      if ('filtered' in response) {
        return {
          content: [],
          finishReason: toContentFilterFinishReason(response.filtered),
          usage: toUsage(undefined),
          warnings,
        }
      }

      return {
        content: response.content.map((part) => {
          switch (part.type) {
            case 'text':
              return schema
                ? { ...part, text: restoreJsonNumbers(part.text, schema) }
                : part
            case 'reasoning':
              return {
                type: 'reasoning' as const,
                text: part.text,
                providerMetadata: {
                  apple: part.signature ? { signature: part.signature } : {},
                },
              }
            case 'tool-call':
              return {
                type: 'tool-call' as const,
                toolCallId: part.toolCallId,
                providerExecuted: true,
                toolName: part.toolName,
                input: restoreToolInput(callTools, part.toolName, part.input),
              }
            case 'tool-result':
              return {
                type: 'tool-result' as const,
                toolCallId: part.toolCallId,
                providerExecuted: true,
                toolName: part.toolName,
                result: part.output,
              }
          }
        }),
        finishReason: toFinishReason(response.usage, options.maxOutputTokens),
        usage: toUsage(response.usage),
        warnings,
      }
    } finally {
      for (const tool of tools) {
        delete globalThis.__APPLE_LLM_TOOLS__[tool.id]
      }
    }
  }

  async doStream(options: LanguageModelV4CallOptions) {
    const { appleOptions, warnings } = await this.prepareCallOptions(options)
    const messages = prepareAppleMessages(options.prompt)
    const { tools: callTools, toolCallingMode } = prepareToolChoice(
      options.tools,
      options.toolChoice
    )
    const tools = this.prepareTools(callTools)

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        `ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.`
      )
    }

    const schema =
      options.responseFormat?.type === 'json'
        ? options.responseFormat.schema
        : undefined

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

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      async start(controller) {
        try {
          const id = (streamId = generateId())

          controller.enqueue({ type: 'stream-start', warnings })

          const snapshots = createSnapshotStreamHandler(
            controller,
            id,
            'apple',
            { schema, tools: callTools }
          )

          const updateListener = NativeAppleLLM.onStreamUpdate((data) => {
            if (data.streamId === streamId) {
              snapshots.update(
                String(data.content ?? ''),
                data.entries as AppleStreamEntry[] | undefined
              )
            }
          })

          const completeListener = NativeAppleLLM.onStreamComplete((data) => {
            if (data.streamId === streamId) {
              snapshots.end()
              controller.enqueue({
                type: 'finish',
                finishReason: toFinishReason(
                  data.usage as AppleUsage | undefined,
                  options.maxOutputTokens
                ),
                usage: toUsage(data.usage as AppleUsage | undefined),
              })
              cleanup()
              controller.close()
            }
          })

          const errorListener = NativeAppleLLM.onStreamError((data) => {
            if (data.streamId === streamId && isContentFilterError(data.code)) {
              snapshots.end({ flushHeldText: false })
              controller.enqueue({
                type: 'finish',
                finishReason: toContentFilterFinishReason(data.code!),
                usage: toUsage(undefined),
              })
              cleanup()
              controller.close()
            } else if (data.streamId === streamId) {
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
            seed: isNativeSeed(options.seed) ? options.seed : undefined,
            tools,
            toolCallingMode,
            providerOptions: appleOptions as unknown as Record<string, unknown>,
            schema: toNativeSchema(schema),
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

// Keep tools in flight when the module is evaluated again, e.g. on Fast Refresh
globalThis.__APPLE_LLM_TOOLS__ ??= {}
