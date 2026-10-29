import type {
  JSONValue,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FilePart,
  LanguageModelV4FinishReason,
  LanguageModelV4FunctionTool,
  LanguageModelV4Prompt,
  LanguageModelV4ProviderTool,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  SharedV4Warning,
} from '@ai-sdk/provider'
import {
  generateId,
  jsonSchema,
  parseJSON,
  resolveFullMediaType,
  type Tool as FullToolDefinition,
  type ToolExecutionOptions,
} from '@ai-sdk/provider-utils'
import { Platform } from 'react-native'

import { AdkErrorCodes, createAdkError, toAdkError } from './errors'
import {
  type AdkAgentConfig,
  type AdkGenerationOptions,
  type AdkMessage,
  type AdkMessagePart,
  type AdkModelType,
  type AdkNanoModelConfig,
  type AdkTool,
  type AdkUsageMetadata,
  getNativeAdkEngine,
  type NanoDownloadProgressEvent,
  type StreamToolCallEvent,
  type ToolCallEvent,
} from './NativeAdkEngine'
import {
  StreamTextFilter,
  stripJsonFences,
  stripRoleMarkers,
} from './streamText'

const DEFAULT_NANO_MODEL = 'gemini-nano'
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'

export type AdkToolDefinitionSet = Record<string, FullToolDefinition>

/** `gemini-nano` runs on device, any other name is a cloud Gemini model */
export type AdkLanguageModelId = 'gemini-nano' | (string & {})

export interface AdkLanguageModelOptions {
  /** `gemini-nano` (default) runs on device, any other id is a cloud Gemini model */
  model?: AdkLanguageModelId
  /** @deprecated Use `model`. Without a model, `gemini` uses `gemini-3.8-flash` */
  modelType?: AdkModelType
  /** @deprecated Use `model` */
  modelName?: AdkLanguageModelId
  /** ADK agent name */
  name?: string
  /** ADK agent description */
  description?: string
  /** System instruction for the agent */
  instruction?: string
  /** Gemini API key, required for `gemini` */
  apiKey?: string
  /** Tools whose `execute` handlers ADK can call */
  availableTools?: AdkToolDefinitionSet
  /** Gemini Nano model selection */
  nano?: AdkNanoModelConfig
}

/** Per-call options passed as `providerOptions.adk` */
export interface AdkProviderOptions {
  /** Thinking token budget for cloud Gemini. `0` disables thinking */
  thinkingBudget?: number
  /** Whether the model's thoughts come back as reasoning parts */
  includeThoughts?: boolean
}

export type AdkModelAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'unknown'

export interface AdkModelInfo {
  model: AdkLanguageModelId
  modelType: AdkModelType
  availability: AdkModelAvailability
  /** Whether `countTokens` works, which only Gemini Nano supports */
  supportsTokenCounting: boolean
  /** Name of the Gemini Nano base model, when ML Kit reports it */
  baseModelName?: string
  /** Gemini Nano input token limit, when ML Kit reports it */
  contextSize?: number
}

export interface AdkDownloadProgress {
  phase: 'started' | 'progress' | 'completed'
  bytesDownloaded?: number
  bytesToDownload?: number
}

export interface AdkPrepareOptions {
  onProgress?: (progress: AdkDownloadProgress) => void
}

export interface AdkLanguageModel extends LanguageModelV4 {
  /** Downloads and initializes Gemini Nano, reporting progress. No-op for cloud models */
  prepare: (options?: AdkPrepareOptions) => Promise<void>
  updateTools: (tools: AdkToolDefinitionSet) => void
  /** Counts tokens with the Gemini Nano tokenizer. Not available for cloud models */
  countTokens: (text: string) => Promise<number>
}

export interface AdkProvider {
  (options?: AdkLanguageModelId | AdkLanguageModelOptions): AdkLanguageModel
  readonly specificationVersion: 'v4'
  languageModel: (
    options?: AdkLanguageModelId | AdkLanguageModelOptions
  ) => AdkLanguageModel
  /**
   * Whether the provider's model, or the default model of `modelType`, can be
   * used now: its availability is `available` or `downloadable`
   */
  isAvailable: (modelType?: AdkModelType) => Promise<boolean>
  /** Availability details for the provider's model, or for `model` */
  getModelInfo: (options?: {
    model?: AdkLanguageModelId
    nano?: AdkNanoModelConfig
  }) => Promise<AdkModelInfo>
  /** @deprecated Check `(await getModelInfo()).availability` instead */
  isNanoSupported: () => Promise<boolean>
  /** @deprecated Use `prepare()` on a Gemini Nano model */
  prepareNano: (options?: AdkPrepareOptions) => Promise<void>
}

type ResolvedModelOptions = Omit<
  AdkLanguageModelOptions,
  'model' | 'modelType' | 'modelName'
> & {
  model: string
  modelType: AdkModelType
}

function resolveModelOptions(
  defaults: AdkLanguageModelOptions,
  options: AdkLanguageModelId | AdkLanguageModelOptions = {}
): ResolvedModelOptions {
  const overrides = typeof options === 'string' ? { model: options } : options
  const {
    model: defaultModel,
    modelName: defaultModelName,
    ...defaultRest
  } = defaults
  const { model, modelName, ...rest } = overrides
  const merged = { ...defaultRest, ...rest }
  const id = model ?? modelName ?? defaultModel ?? defaultModelName
  const modelType =
    merged.modelType ??
    (id && id !== DEFAULT_NANO_MODEL ? 'gemini' : 'genai-nano')

  return {
    ...merged,
    modelType,
    model:
      id ??
      (modelType === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_NANO_MODEL),
  }
}

const toModelAvailability = (value: string): AdkModelAvailability => {
  switch (value) {
    case 'available':
    case 'downloadable':
    case 'downloading':
    case 'unavailable':
      return value
    default:
      return 'unknown'
  }
}

const listenForDownloadProgress = (
  onProgress: AdkPrepareOptions['onProgress']
) =>
  onProgress
    ? getNativeAdkEngine().onNanoDownloadProgress(
        (event: NanoDownloadProgressEvent) => {
          onProgress({
            phase: event.phase as AdkDownloadProgress['phase'],
            bytesDownloaded: event.bytesDownloaded,
            bytesToDownload: event.bytesToDownload,
          })
        }
      )
    : null

async function getModelInfo(
  { model, modelType }: ResolvedModelOptions,
  nano: AdkNanoModelConfig | undefined
): Promise<AdkModelInfo> {
  const supportsTokenCounting = modelType === 'genai-nano'

  if (Platform.OS !== 'android') {
    return {
      model,
      modelType,
      availability: 'unavailable',
      supportsTokenCounting,
    }
  }

  const info = await getNativeAdkEngine()
    .getModelInfo(modelType, nano)
    .catch((error: unknown) => {
      throw toAdkError(error)
    })
  return {
    model,
    modelType,
    availability: toModelAvailability(info.availability),
    supportsTokenCounting,
    baseModelName: info.baseModelName,
    contextSize: info.contextSize,
  }
}

export function createAdkProvider(
  defaults: AdkLanguageModelOptions = {}
): AdkProvider {
  const createLanguageModel = (
    options?: AdkLanguageModelId | AdkLanguageModelOptions
  ): AdkLanguageModel =>
    new AdkChatLanguageModel(resolveModelOptions(defaults, options))

  const provider = function (
    options?: AdkLanguageModelId | AdkLanguageModelOptions
  ) {
    return createLanguageModel(options)
  }
  provider.specificationVersion = 'v4' as const
  provider.languageModel = createLanguageModel
  provider.isAvailable = async (modelType?: AdkModelType) => {
    const resolved = modelType
      ? resolveModelOptions({}, { modelType })
      : resolveModelOptions(defaults)
    const { availability } = await getModelInfo(resolved, defaults.nano)
    return availability === 'available' || availability === 'downloadable'
  }
  provider.getModelInfo = (
    options: { model?: AdkLanguageModelId; nano?: AdkNanoModelConfig } = {}
  ) =>
    getModelInfo(
      options.model
        ? resolveModelOptions({}, options.model)
        : resolveModelOptions(defaults),
      options.nano ?? defaults.nano
    )
  provider.isNanoSupported = async () => {
    const { availability } = await getModelInfo(
      resolveModelOptions({}, DEFAULT_NANO_MODEL),
      defaults.nano
    )
    return availability !== 'unavailable' && availability !== 'unknown'
  }
  provider.prepareNano = (options?: AdkPrepareOptions) =>
    createLanguageModel({
      model: DEFAULT_NANO_MODEL,
      modelType: 'genai-nano',
    }).prepare(options)
  return provider
}

export const adk = createAdkProvider()

type Tool = LanguageModelV4FunctionTool | LanguageModelV4ProviderTool

const toolChoiceWarning: SharedV4Warning = {
  type: 'unsupported',
  feature: 'toolChoice',
  details: 'ADK runs tools natively and cannot be required to call a tool.',
}

function prepareToolChoice(
  tools: Tool[] = [],
  toolChoice: LanguageModelV4CallOptions['toolChoice']
): { tools: Tool[]; warnings: SharedV4Warning[] } {
  switch (toolChoice?.type) {
    case 'none':
      return { tools: [], warnings: [] }
    case 'required':
      return { tools, warnings: [toolChoiceWarning] }
    case 'tool':
      return {
        tools: tools.filter((tool) => tool.name === toolChoice.toolName),
        warnings: [toolChoiceWarning],
      }
    default:
      return { tools, warnings: [] }
  }
}

// Gemini thinking budgets for the AI SDK reasoning levels
const thinkingBudgets = {
  minimal: 512,
  low: 2048,
  medium: 8192,
  high: 24576,
  xhigh: 24576,
  max: 24576,
} as const

function prepareThinking(
  reasoning: LanguageModelV4CallOptions['reasoning'],
  adkOptions: AdkProviderOptions
): AdkGenerationOptions['thinking'] {
  if (adkOptions.thinkingBudget !== undefined) {
    return {
      includeThoughts:
        adkOptions.includeThoughts ?? adkOptions.thinkingBudget !== 0,
      budget: adkOptions.thinkingBudget,
    }
  }

  switch (reasoning) {
    case undefined:
    case 'provider-default':
      return adkOptions.includeThoughts === undefined
        ? undefined
        : { includeThoughts: adkOptions.includeThoughts }
    case 'none':
      return { includeThoughts: false, budget: 0 }
    default:
      return {
        includeThoughts: adkOptions.includeThoughts ?? true,
        budget: thinkingBudgets[reasoning],
      }
  }
}

const mapUsage = (usage?: AdkUsageMetadata): LanguageModelV4Usage => {
  const promptTokens = usage?.promptTokenCount
  const cachedTokens = usage?.cachedContentTokenCount
  const textTokens = usage?.candidatesTokenCount
  const reasoningTokens = usage?.thoughtsTokenCount

  return {
    inputTokens: {
      total: promptTokens,
      noCache:
        promptTokens !== undefined && cachedTokens !== undefined
          ? promptTokens - cachedTokens
          : undefined,
      cacheRead: cachedTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      // Gemini counts thoughts separately from candidates
      total:
        textTokens === undefined && reasoningTokens === undefined
          ? undefined
          : (textTokens ?? 0) + (reasoningTokens ?? 0),
      text: textTokens,
      reasoning: reasoningTokens,
    },
    raw: usage ? { ...usage } : undefined,
  }
}

const contentFilterReasons = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
  'IMAGE_RECITATION',
])

const convertFinishReason = (
  finishReason?: string
): LanguageModelV4FinishReason => {
  let unified: LanguageModelV4FinishReason['unified'] = 'other'

  if (finishReason === undefined || finishReason === 'STOP') {
    unified = 'stop'
  } else if (finishReason === 'MAX_TOKENS') {
    unified = 'length'
  } else if (contentFilterReasons.has(finishReason)) {
    unified = 'content-filter'
  } else if (
    finishReason === 'MALFORMED_FUNCTION_CALL' ||
    finishReason === 'UNEXPECTED_TOOL_CALL'
  ) {
    unified = 'error'
  }

  return {
    unified,
    raw: finishReason,
  }
}

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary)
}

const localUrlProtocols = new Set(['file:', 'content:'])

const toFileMessagePart = (part: LanguageModelV4FilePart): AdkMessagePart => {
  // v4 allows top-level media types such as `image`, which Gemini rejects
  const mimeType = resolveFullMediaType({ part })

  switch (part.data.type) {
    case 'data':
      return {
        type: 'file',
        mimeType,
        data:
          typeof part.data.data === 'string'
            ? part.data.data.replace(/^data:[^;]+;base64,/, '')
            : uint8ArrayToBase64(part.data.data),
      }
    case 'url':
      // The AI SDK downloads other URLs because they are not in `supportedUrls`
      if (!localUrlProtocols.has(part.data.url.protocol)) {
        throw createAdkError(
          `ADK only reads file:// and content:// URLs. Got ${part.data.url.protocol}`,
          AdkErrorCodes.InvalidMessage
        )
      }
      return { type: 'file', mimeType, uri: part.data.url.toString() }
    case 'text':
      return { type: 'text', text: part.data.text }
    default:
      throw createAdkError(
        'ADK does not support provider file references.',
        AdkErrorCodes.InvalidMessage
      )
  }
}

const getAbortReason = (signal: AbortSignal) => {
  if (signal.reason !== undefined) {
    return signal.reason
  }
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

const stringifyToolOutput = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value ?? null)

const parseToolResult = (output: string): NonNullable<JSONValue> => {
  try {
    return (JSON.parse(output) as JSONValue) ?? {}
  } catch {
    return output
  }
}

const createNanoJsonInstruction = (schema: unknown) =>
  schema
    ? `Respond only with JSON that matches this JSON schema, without Markdown or other text:\n${JSON.stringify(schema)}`
    : 'Respond only with valid JSON, without Markdown or other text.'

class AdkChatLanguageModel implements AdkLanguageModel {
  readonly specificationVersion = 'v4'
  readonly supportedUrls = {
    'image/*': [/^file:\/\//, /^content:\/\//],
  }

  readonly provider = 'adk'
  readonly modelId: string

  private readonly agentConfig: AdkAgentConfig
  private tools: AdkToolDefinitionSet = {}
  private nanoPreparePromise: Promise<void> | null = null

  constructor(options: ResolvedModelOptions) {
    this.modelId = options.model
    this.agentConfig = {
      name: options.name ?? 'react_native_adk_agent',
      description: options.description ?? 'React Native ADK agent',
      instruction: options.instruction,
      model: {
        type: options.modelType,
        name: options.model,
        apiKey: options.apiKey,
        nano: options.nano,
      },
    }
    this.updateTools(options.availableTools ?? {})
  }

  private get isNano() {
    return this.agentConfig.model.type === 'genai-nano'
  }

  updateTools(tools: AdkToolDefinitionSet) {
    this.tools = tools
  }

  async prepare(options: AdkPrepareOptions = {}): Promise<void> {
    if (!this.isNano) {
      return
    }

    const listener = listenForDownloadProgress(options.onProgress)
    try {
      await this.ensureNanoPrepared()
    } finally {
      listener?.remove()
    }
  }

  async countTokens(text: string): Promise<number> {
    if (!this.isNano) {
      throw createAdkError(
        'Token counting is only available for Gemini Nano.',
        AdkErrorCodes.ModelUnavailable
      )
    }

    try {
      return await getNativeAdkEngine().countTokens(
        text,
        this.agentConfig.model.nano
      )
    } catch (error) {
      throw toAdkError(error)
    }
  }

  private ensureNanoPrepared(): Promise<void> {
    if (!this.isNano) {
      return Promise.resolve()
    }

    if (!this.nanoPreparePromise) {
      this.nanoPreparePromise = getNativeAdkEngine()
        .prepareNano(this.agentConfig.model.nano)
        .catch((error: unknown) => {
          this.nanoPreparePromise = null
          throw toAdkError(error)
        })
    }

    return this.nanoPreparePromise
  }

  private prepareMessages(
    messages: LanguageModelV4Prompt,
    warnings: SharedV4Warning[]
  ): AdkMessage[] {
    // System messages become part of the agent instruction instead
    return messages.flatMap((message): AdkMessage[] => {
      if (message.role === 'system') {
        return []
      }

      if (message.role === 'user') {
        const parts = message.content.map((part): AdkMessagePart => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text }
          }
          return toFileMessagePart(part)
        })

        if (parts.length === 1 && parts[0]?.type === 'text') {
          return [{ role: 'user', content: parts[0].text }]
        }

        return [{ role: 'user', parts }]
      }

      if (message.role === 'assistant') {
        // ADK replays history as text, so earlier tool steps become text too
        const content = message.content
          .flatMap((part) => {
            switch (part.type) {
              case 'text':
                return [part.text]
              case 'tool-call':
                return [
                  `[Tool call: ${part.toolName}(${stringifyToolOutput(part.input)})]`,
                ]
              case 'tool-result':
                return [
                  `[Tool result for ${part.toolName}: ${stringifyToolOutput(
                    'value' in part.output ? part.output.value : part.output
                  )}]`,
                ]
              case 'reasoning':
                return []
              default:
                warnings.push({
                  type: 'unsupported',
                  feature: `assistant ${part.type} parts`,
                  details: 'ADK replays assistant messages as text only.',
                })
                return []
            }
          })
          .join('\n')

        return [{ role: 'assistant', content }]
      }

      if (message.role === 'tool') {
        const content = message.content
          .filter((part) => part.type === 'tool-result')
          .map((part) => {
            if (part.output.type === 'execution-denied') {
              return part.output.reason ?? 'Execution denied'
            }
            return stringifyToolOutput(part.output.value)
          })
          .join('\n')

        return [{ role: 'user', content }]
      }

      throw createAdkError(
        'Unsupported message role for ADK provider',
        AdkErrorCodes.InvalidMessage
      )
    })
  }

  private prepareAgentConfig(
    options: LanguageModelV4CallOptions
  ): AdkAgentConfig {
    // ADK only takes a system prompt as the agent instruction
    const systemPrompts = options.prompt.flatMap((message) =>
      message.role === 'system' ? [message.content] : []
    )
    // Gemini Nano has no response schema, so the schema goes in the instruction
    const jsonInstruction =
      this.isNano && options.responseFormat?.type === 'json'
        ? createNanoJsonInstruction(options.responseFormat.schema)
        : undefined

    if (systemPrompts.length === 0 && !jsonInstruction) {
      return this.agentConfig
    }

    const instruction = [
      this.agentConfig.instruction,
      ...systemPrompts,
      jsonInstruction,
    ]
      .filter(Boolean)
      .join('\n\n')

    return { ...this.agentConfig, instruction }
  }

  private prepareGenerationOptions(
    options: LanguageModelV4CallOptions,
    warnings: SharedV4Warning[]
  ): AdkGenerationOptions {
    const adkOptions = (options.providerOptions?.adk ??
      {}) as AdkProviderOptions

    if (this.isNano) {
      // ADK's ML Kit model only passes on temperature, topK and maxOutputTokens
      const unsupported = {
        topP: options.topP,
        seed: options.seed,
        stopSequences: options.stopSequences,
        presencePenalty: options.presencePenalty,
        frequencyPenalty: options.frequencyPenalty,
      }
      for (const [feature, value] of Object.entries(unsupported)) {
        if (value !== undefined) {
          warnings.push({
            type: 'unsupported',
            feature,
            details: 'Gemini Nano does not support this setting.',
          })
        }
      }
    }

    return {
      temperature: options.temperature,
      maxTokens: options.maxOutputTokens,
      topP: options.topP,
      topK: options.topK,
      seed: options.seed,
      stopSequences: options.stopSequences,
      presencePenalty: options.presencePenalty,
      frequencyPenalty: options.frequencyPenalty,
      responseFormat:
        options.responseFormat?.type === 'json'
          ? {
              type: 'json',
              mimeType: 'application/json',
              schema: this.isNano ? undefined : options.responseFormat.schema,
            }
          : undefined,
      thinking: prepareThinking(options.reasoning, adkOptions),
    }
  }

  private prepareTools(tools: Tool[], warnings: SharedV4Warning[]) {
    const functionTools = tools.filter(
      (tool): tool is LanguageModelV4FunctionTool => {
        if (tool.type === 'function') {
          return true
        }
        warnings.push({
          type: 'unsupported',
          feature: `provider-defined tool ${tool.name}`,
        })
        return false
      }
    )

    for (const tool of functionTools) {
      if (!this.tools[tool.name]?.execute) {
        warnings.push({
          type: 'other',
          message: `Tool "${tool.name}" has no executor. Pass it to createAdkProvider via availableTools so ADK can run it.`,
        })
      }
    }

    return functionTools.map(
      (tool): AdkTool => ({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema,
      })
    )
  }

  private async executeTool(
    tool: LanguageModelV4FunctionTool,
    event: ToolCallEvent
  ) {
    const execute = this.tools[tool.name]?.execute
    if (!execute) {
      return { error: `Tool "${tool.name}" is not available in this app.` }
    }

    const input = await parseJSON({
      text: event.arguments,
      schema: jsonSchema(tool.inputSchema),
    })
    const options: ToolExecutionOptions<unknown> = {
      toolCallId: event.toolCallId,
      messages: [],
      context: undefined,
    }
    return execute(input, options)
  }

  private prepareCall(options: LanguageModelV4CallOptions) {
    const { tools, warnings } = prepareToolChoice(
      options.tools,
      options.toolChoice
    )
    const messages = this.prepareMessages(options.prompt, warnings)
    const generationOptions = this.prepareGenerationOptions(options, warnings)

    return {
      messages,
      generationOptions,
      tools,
      nativeTools: this.prepareTools(tools, warnings),
      agentConfig: this.prepareAgentConfig(options),
      warnings,
    }
  }

  // Runs the tools that native code calls during `runId`
  private listenForToolCalls(runId: string, tools: Tool[]) {
    const native = getNativeAdkEngine()

    return native.onToolCall(async (event: ToolCallEvent) => {
      if (event.runId !== runId) {
        return
      }

      const tool = tools.find(
        (candidate): candidate is LanguageModelV4FunctionTool =>
          candidate.type === 'function' && candidate.name === event.toolName
      )
      let result: unknown
      try {
        result = tool
          ? await this.executeTool(tool, event)
          : { error: `Tool not found: ${event.toolName}` }
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : String(error),
        }
      }
      // Always JSON, so native code can tell strings from other values
      native.submitToolResult(
        runId,
        event.toolCallId,
        JSON.stringify(result ?? null)
      )
    })
  }

  async doGenerate(options: LanguageModelV4CallOptions) {
    const {
      messages,
      generationOptions,
      tools,
      nativeTools,
      agentConfig,
      warnings,
    } = this.prepareCall(options)
    const runId = generateId()
    const native = getNativeAdkEngine()
    const abortSignal = options.abortSignal

    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }

    const onAbort = () => {
      void native
        .cancelStream(runId)
        .catch((error) => console.warn('[adk] cancel failed:', error))
    }

    const toolListener = this.listenForToolCalls(runId, tools)
    abortSignal?.addEventListener('abort', onAbort, { once: true })

    try {
      await this.ensureNanoPrepared()

      const response = await native.generateText(
        runId,
        messages,
        agentConfig,
        generationOptions,
        nativeTools
      )

      const content: LanguageModelV4Content[] = []
      if (response.reasoning) {
        content.push({ type: 'reasoning', text: response.reasoning })
      }
      for (const toolCall of response.toolCalls ?? []) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          input: toolCall.input,
          providerExecuted: true,
        })
      }
      for (const toolResult of response.toolResults ?? []) {
        content.push({
          type: 'tool-result',
          toolCallId: toolResult.toolCallId,
          toolName: toolResult.toolName,
          result: parseToolResult(toolResult.output),
        })
      }
      const text = this.isNano
        ? stripRoleMarkers(response.content)
        : response.content
      content.push({
        type: 'text',
        text:
          options.responseFormat?.type === 'json'
            ? stripJsonFences(text)
            : text,
      })

      return {
        content,
        finishReason: convertFinishReason(response.finishReason),
        usage: mapUsage(response.usage),
        warnings,
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        throw getAbortReason(abortSignal)
      }
      throw toAdkError(error)
    } finally {
      abortSignal?.removeEventListener('abort', onAbort)
      toolListener.remove()
    }
  }

  async doStream(options: LanguageModelV4CallOptions) {
    const {
      messages,
      generationOptions,
      tools,
      nativeTools,
      agentConfig,
      warnings,
    } = this.prepareCall(options)
    const streamId = generateId()
    const native = getNativeAdkEngine()
    const abortSignal = options.abortSignal
    const isJson = options.responseFormat?.type === 'json'

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        'ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.'
      )
    }

    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }

    let listeners: { remove(): void }[] = []
    let cleanedUp = false
    const toolListener = this.listenForToolCalls(streamId, tools)
    const toolNames = new Map<string, string>()

    let onAbort = () => {}

    const cleanup = () => {
      if (cleanedUp) {
        return
      }
      cleanedUp = true
      listeners.forEach((listener) => {
        listener.remove()
      })
      listeners = []
      abortSignal?.removeEventListener('abort', onAbort)
      toolListener.remove()
    }

    const cancelNative = () => {
      void native
        .cancelStream(streamId)
        .catch((error) => console.warn('[adk] cancelStream failed:', error))
    }

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: async (controller) => {
        const textId = `${streamId}-text`
        let textOpen = false
        let reasoningId: string | undefined
        let reasoningCount = 0
        const textFilter = new StreamTextFilter({
          json: isJson,
          toolCode: this.isNano,
          roleMarkers: this.isNano,
        })

        const addListener = (listener: { remove(): void }) => {
          listeners.push(listener)
        }

        const closeReasoning = () => {
          if (reasoningId) {
            controller.enqueue({ type: 'reasoning-end', id: reasoningId })
            reasoningId = undefined
          }
        }

        const emitText = (delta: string) => {
          if (!delta) {
            return
          }
          closeReasoning()
          if (!textOpen) {
            controller.enqueue({ type: 'text-start', id: textId })
            textOpen = true
          }
          controller.enqueue({ type: 'text-delta', id: textId, delta })
        }

        controller.enqueue({ type: 'stream-start', warnings })

        onAbort = () => {
          cleanup()
          cancelNative()
          controller.error(abortSignal && getAbortReason(abortSignal))
        }
        abortSignal?.addEventListener('abort', onAbort, { once: true })

        addListener(
          native.onStreamUpdate((data) => {
            if (data.streamId !== streamId || !data.delta) {
              return
            }

            if (data.kind === 'reasoning') {
              if (!reasoningId) {
                reasoningId = `${streamId}-reasoning-${reasoningCount++}`
                controller.enqueue({ type: 'reasoning-start', id: reasoningId })
              }
              controller.enqueue({
                type: 'reasoning-delta',
                id: reasoningId,
                delta: data.delta,
              })
              return
            }

            emitText(textFilter.push(data.delta))
          })
        )

        addListener(
          native.onStreamToolCall((data: StreamToolCallEvent) => {
            if (data.streamId !== streamId) {
              return
            }

            if (data.phase === 'start' && data.toolName) {
              closeReasoning()
              textFilter.endTurn()
              toolNames.set(data.toolCallId, data.toolName)
              controller.enqueue({
                type: 'tool-input-start',
                id: data.toolCallId,
                toolName: data.toolName,
                providerExecuted: true,
              })
              return
            }

            if (data.phase === 'delta' && data.inputDelta) {
              controller.enqueue({
                type: 'tool-input-delta',
                id: data.toolCallId,
                delta: data.inputDelta,
              })
              return
            }

            if (data.phase === 'end' && data.toolName && data.input) {
              controller.enqueue({
                type: 'tool-input-end',
                id: data.toolCallId,
              })
              controller.enqueue({
                type: 'tool-call',
                toolCallId: data.toolCallId,
                toolName: data.toolName,
                input: data.input,
                providerExecuted: true,
              })
              return
            }

            if (data.phase === 'result' && data.output !== undefined) {
              controller.enqueue({
                type: 'tool-result',
                toolCallId: data.toolCallId,
                toolName:
                  data.toolName ?? toolNames.get(data.toolCallId) ?? 'unknown',
                result: parseToolResult(data.output),
              })
            }
          })
        )

        addListener(
          native.onStreamComplete((data) => {
            if (data.streamId !== streamId) {
              return
            }
            emitText(textFilter.flush())
            closeReasoning()
            if (textOpen) {
              controller.enqueue({ type: 'text-end', id: textId })
            }
            controller.enqueue({
              type: 'finish',
              finishReason: convertFinishReason(data.finishReason),
              usage: mapUsage(data.usage),
            })
            cleanup()
            controller.close()
          })
        )

        addListener(
          native.onStreamError((data) => {
            if (data.streamId === streamId) {
              controller.enqueue({
                type: 'error',
                error: toAdkError(data.error, data.code),
              })
              cleanup()
              controller.close()
            }
          })
        )

        try {
          await this.ensureNanoPrepared()

          await native.streamText(
            streamId,
            messages,
            agentConfig,
            generationOptions,
            nativeTools
          )
        } catch (error) {
          cleanup()
          controller.error(toAdkError(error))
        }
      },
      cancel: () => {
        cleanup()
        cancelNative()
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
