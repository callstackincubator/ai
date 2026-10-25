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
  type StreamCompleteEvent,
  type StreamErrorEvent,
  type StreamToolCallEvent,
  type StreamUpdateEvent,
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

  private async parseToolInput(
    tool: LanguageModelV4FunctionTool,
    event: ToolCallEvent
  ) {
    return parseJSON({
      text: event.arguments,
      schema: jsonSchema(tool.inputSchema),
    })
  }

  private toolExecutionOptions(
    event: ToolCallEvent
  ): ToolExecutionOptions<unknown> {
    return { toolCallId: event.toolCallId, messages: [], context: undefined }
  }

  // Runs and checks the tools of one call by the name native code reports
  private toolRunner(tools: Tool[]): ToolRunner {
    const find = (event: ToolCallEvent) =>
      tools.find(
        (candidate): candidate is LanguageModelV4FunctionTool =>
          candidate.type === 'function' && candidate.name === event.toolName
      )

    return {
      execute: async (event) => {
        const tool = find(event)
        const execute = tool && this.tools[tool.name]?.execute
        if (!tool || !execute) {
          return {
            error: `Tool "${event.toolName}" is not available in this app.`,
          }
        }
        return execute(
          await this.parseToolInput(tool, event),
          this.toolExecutionOptions(event)
        )
      },
      needsApproval: async (event) => {
        const tool = find(event)
        const needsApproval = tool && this.tools[tool.name]?.needsApproval
        if (!tool || typeof needsApproval !== 'function') {
          return needsApproval === true
        }
        return needsApproval(
          await this.parseToolInput(tool, event),
          this.toolExecutionOptions(event)
        )
      },
    }
  }

  /** Whether this call may pause for a tool approval or answers one */
  private mayUseApprovals(options: LanguageModelV4CallOptions) {
    return (
      getApprovalResponses(options.prompt).length > 0 ||
      (options.tools ?? []).some((tool) =>
        Boolean(this.tools[tool.name]?.needsApproval)
      )
    )
  }

  private prepareCall(options: LanguageModelV4CallOptions) {
    cancelAbandonedRuns(options.prompt)

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

  async doGenerate(options: LanguageModelV4CallOptions) {
    // Approvals pause the native run midway, which only a stream can return
    if (this.mayUseApprovals(options)) {
      return this.generateFromStream(options)
    }

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

    const toolListener = listenForToolCalls(runId, this.toolRunner(tools))
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

  private async generateFromStream(options: LanguageModelV4CallOptions) {
    const { stream } = await this.doStream(options)
    const content: LanguageModelV4Content[] = []
    const texts = new Map<string, string>()
    let warnings: SharedV4Warning[] = []
    let finishReason = convertFinishReason()
    let usage = mapUsage()

    const reader = stream.getReader()
    while (true) {
      const { done, value: part } = await reader.read()
      if (done) {
        return { content, finishReason, usage, warnings }
      }

      switch (part.type) {
        case 'stream-start':
          warnings = part.warnings
          break
        case 'text-delta':
        case 'reasoning-delta':
          texts.set(part.id, (texts.get(part.id) ?? '') + part.delta)
          break
        case 'text-end':
          content.push({ type: 'text', text: texts.get(part.id) ?? '' })
          break
        case 'reasoning-end':
          content.push({ type: 'reasoning', text: texts.get(part.id) ?? '' })
          break
        case 'tool-call':
        case 'tool-result':
          content.push(part)
          break
        case 'error':
          throw part.error
        case 'finish':
          finishReason = part.finishReason
          usage = part.usage
          break
      }
    }
  }

  async doStream(options: LanguageModelV4CallOptions) {
    const abortSignal = options.abortSignal

    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        'ReadableStream is not available in this environment. Please load a polyfill, such as web-streams-polyfill.'
      )
    }

    if (abortSignal?.aborted) {
      throw getAbortReason(abortSignal)
    }

    const rawCall = {
      rawPrompt: options.prompt,
      rawSettings: {},
    }

    const approvals = matchApprovalResponses(options.prompt)
    if (approvals) {
      const { run, responses } = approvals
      const stream = new ReadableStream<LanguageModelV4StreamPart>({
        start: (controller) => {
          run.attach(controller, abortSignal, [])
          for (const response of responses) {
            run.resolveApproval(response)
          }
          run.pauseIfAwaitingApproval()
        },
        cancel: () => run.cancel(),
      })
      return { stream, rawCall }
    }

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
    const run = new AdkStreamRun(
      streamId,
      {
        json: options.responseFormat?.type === 'json',
        toolCode: this.isNano,
        roleMarkers: this.isNano,
      },
      this.toolRunner(tools)
    )

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: async (controller) => {
        run.attach(controller, abortSignal, warnings)

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
          run.fail(error)
        }
      },
      cancel: () => run.cancel(),
    })

    return { stream, rawCall }
  }
}

interface ToolRunner {
  execute: (event: ToolCallEvent) => Promise<unknown>
  needsApproval: (event: ToolCallEvent) => Promise<boolean>
}

type StreamController =
  ReadableStreamDefaultController<LanguageModelV4StreamPart>

// Always JSON, so native code can tell strings from other values
const submitToolOutput = (event: ToolCallEvent, output: unknown) =>
  getNativeAdkEngine().submitToolResult(
    event.runId,
    event.toolCallId,
    JSON.stringify(output ?? null)
  )

async function runTool(event: ToolCallEvent, execute: () => unknown) {
  try {
    const output = await execute()
    if (output !== pausedForApproval) {
      submitToolOutput(event, output)
    }
  } catch (error) {
    submitToolOutput(event, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Runs the JS tools that ADK calls during one native run */
function listenForToolCalls(
  runId: string,
  runner: ToolRunner,
  /** Returns `true` when the call waits for approval instead of running */
  pauseForApproval?: (event: ToolCallEvent) => Promise<boolean>
) {
  return getNativeAdkEngine().onToolCall(async (event: ToolCallEvent) => {
    if (event.runId !== runId) {
      return
    }

    await runTool(event, async () => {
      if (await pauseForApproval?.(event)) {
        return pausedForApproval
      }
      return runner.execute(event)
    })
  })
}

// Returned instead of a tool output while the native call waits for approval
const pausedForApproval = Symbol('pausedForApproval')

interface PausedToolCall {
  run: AdkStreamRun
  /** The native call that waits for the tool output */
  event: ToolCallEvent
  execute: () => Promise<unknown>
}

/**
 * Tool calls waiting for approval, by tool call id. Their native runs stay
 * suspended until a later call answers them
 */
const pausedToolCalls = new Map<string, PausedToolCall>()

interface ApprovalResponse {
  toolCallId: string
  approved: boolean
  reason?: string
}

const getApprovalResponses = (prompt: LanguageModelV4Prompt) => {
  const last = prompt[prompt.length - 1]
  return last?.role === 'tool'
    ? last.content.filter((part) => part.type === 'tool-approval-response')
    : []
}

/**
 * Matches the approval responses that end the prompt to paused tool calls.
 * The AI SDK removes approval requests from the prompt and creates their ids
 * itself, so responses pair in order with the paused calls of the last
 * assistant message
 */
function matchApprovalResponses(prompt: LanguageModelV4Prompt) {
  const responses = getApprovalResponses(prompt)
  if (responses.length === 0) {
    return undefined
  }

  const assistant = prompt.filter((message) => message.role === 'assistant')
  const toolCallIds = (assistant[assistant.length - 1]?.content ?? []).flatMap(
    (part) => (part.type === 'tool-call' ? [part.toolCallId] : [])
  )
  const run = toolCallIds
    .map((toolCallId) => pausedToolCalls.get(toolCallId)?.run)
    .find(Boolean)
  if (!run) {
    throw createAdkError(
      'The tool call waiting for approval is no longer running. ADK keeps paused runs in memory only.',
      AdkErrorCodes.ToolCallError
    )
  }

  const pending = toolCallIds.filter(
    (toolCallId) => pausedToolCalls.get(toolCallId)?.run === run
  )
  return {
    run,
    responses: responses.slice(0, pending.length).map(
      (response, index): ApprovalResponse => ({
        toolCallId: pending[index]!,
        approved: response.approved,
        reason: response.reason,
      })
    ),
  }
}

/** Cancels runs paused in an earlier step that the prompt moved past */
function cancelAbandonedRuns(prompt: LanguageModelV4Prompt) {
  for (const message of prompt) {
    if (message.role !== 'assistant') {
      continue
    }
    for (const part of message.content) {
      if (part.type === 'tool-call') {
        pausedToolCalls.get(part.toolCallId)?.run.cancel()
      }
    }
  }
}

/**
 * One native ADK stream. It outlives a single `doStream` call when a tool call
 * needs approval: the stream finishes, the native run stays suspended, and the
 * call that answers the approval attaches a new stream to it
 */
class AdkStreamRun {
  private readonly native = getNativeAdkEngine()
  private listeners: { remove(): void }[]
  private controller?: StreamController
  private removeAbortListener = () => {}
  // Native events that arrive while no stream is attached
  private buffered: (() => void)[] = []
  private done = false

  private readonly awaitingApproval = new Set<string>()
  private readonly emittedToolCalls = new Set<string>()
  private readonly deniedToolCalls = new Set<string>()
  private readonly toolNames = new Map<string, string>()

  // Per-stream state
  private segment = 0
  private textOpen = false
  private reasoningId: string | undefined
  private reasoningCount = 0
  private textFilter: StreamTextFilter

  constructor(
    private readonly streamId: string,
    private readonly textOptions: {
      json: boolean
      toolCode: boolean
      roleMarkers: boolean
    },
    private readonly runner: ToolRunner
  ) {
    this.textFilter = new StreamTextFilter(textOptions)

    const forStream =
      <T extends { streamId: string }>(handle: (data: T) => void) =>
      (data: T) => {
        if (data.streamId === streamId) {
          this.dispatch(() => handle(data))
        }
      }

    this.listeners = [
      this.native.onStreamUpdate(forStream((data) => this.onUpdate(data))),
      this.native.onStreamToolCall(forStream((data) => this.onToolCall(data))),
      this.native.onStreamComplete(forStream((data) => this.onComplete(data))),
      this.native.onStreamError(forStream((data) => this.onError(data))),
      listenForToolCalls(streamId, runner, (event) =>
        this.pauseForApproval(event)
      ),
    ]
  }

  private get textId() {
    return this.segment > 1
      ? `${this.streamId}-text-${this.segment}`
      : `${this.streamId}-text`
  }

  attach(
    controller: StreamController,
    abortSignal: AbortSignal | undefined,
    warnings: SharedV4Warning[]
  ) {
    this.controller = controller
    this.segment++
    this.textOpen = false
    this.reasoningId = undefined
    this.textFilter = new StreamTextFilter(this.textOptions)

    controller.enqueue({ type: 'stream-start', warnings })

    if (abortSignal) {
      const onAbort = () => {
        this.cancel()
        controller.error(getAbortReason(abortSignal))
      }
      abortSignal.addEventListener('abort', onAbort, { once: true })
      this.removeAbortListener = () =>
        abortSignal.removeEventListener('abort', onAbort)
    }

    const buffered = this.buffered
    this.buffered = []
    buffered.forEach((handle) => this.dispatch(handle))
  }

  private detach() {
    this.removeAbortListener()
    this.removeAbortListener = () => {}
    this.controller = undefined
  }

  private dispatch(handle: () => void) {
    if (this.controller) {
      handle()
    } else if (!this.done) {
      this.buffered.push(handle)
    }
  }

  private finish() {
    this.done = true
    this.listeners.forEach((listener) => listener.remove())
    this.listeners = []
    this.buffered = []
    for (const [toolCallId, paused] of pausedToolCalls) {
      if (paused.run === this) {
        pausedToolCalls.delete(toolCallId)
      }
    }
    this.detach()
  }

  cancel() {
    if (this.done) {
      return
    }
    this.finish()
    void this.native
      .cancelStream(this.streamId)
      .catch((error) => console.warn('[adk] cancelStream failed:', error))
  }

  fail(error: unknown) {
    const controller = this.controller
    this.finish()
    controller?.error(toAdkError(error))
  }

  private async pauseForApproval(event: ToolCallEvent) {
    if (!(await this.runner.needsApproval(event))) {
      return false
    }

    pausedToolCalls.set(event.toolCallId, {
      run: this,
      event,
      execute: () => this.runner.execute(event),
    })
    this.awaitingApproval.add(event.toolCallId)
    this.dispatch(() => this.pauseIfAwaitingApproval())
    return true
  }

  resolveApproval({ toolCallId, approved, reason }: ApprovalResponse) {
    const paused = pausedToolCalls.get(toolCallId)
    if (!paused) {
      return
    }
    pausedToolCalls.delete(toolCallId)
    this.awaitingApproval.delete(toolCallId)

    if (approved) {
      void runTool(paused.event, paused.execute)
      return
    }
    // The AI SDK reports the denial, so the native result is not streamed
    this.deniedToolCalls.add(toolCallId)
    submitToolOutput(paused.event, {
      error: 'The user denied this tool call.',
      ...(reason ? { reason } : {}),
    })
  }

  /**
   * Finishes the attached stream once every call that waits for approval was
   * streamed, so the AI SDK can ask for the approval
   */
  pauseIfAwaitingApproval() {
    const controller = this.controller
    if (!controller || this.awaitingApproval.size === 0) {
      return
    }
    for (const toolCallId of this.awaitingApproval) {
      if (!this.emittedToolCalls.has(toolCallId)) {
        return
      }
    }

    this.endContent(controller)
    controller.enqueue({
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: undefined },
      usage: mapUsage(),
    })
    this.detach()
    controller.close()
  }

  private closeReasoning(controller: StreamController) {
    if (this.reasoningId) {
      controller.enqueue({ type: 'reasoning-end', id: this.reasoningId })
      this.reasoningId = undefined
    }
  }

  private emitText(controller: StreamController, delta: string) {
    if (!delta) {
      return
    }
    this.closeReasoning(controller)
    if (!this.textOpen) {
      controller.enqueue({ type: 'text-start', id: this.textId })
      this.textOpen = true
    }
    controller.enqueue({ type: 'text-delta', id: this.textId, delta })
  }

  private endContent(controller: StreamController) {
    this.emitText(controller, this.textFilter.flush())
    this.closeReasoning(controller)
    if (this.textOpen) {
      controller.enqueue({ type: 'text-end', id: this.textId })
      this.textOpen = false
    }
  }

  private onUpdate(data: StreamUpdateEvent) {
    const controller = this.controller!
    if (!data.delta) {
      return
    }

    if (data.kind === 'reasoning') {
      if (!this.reasoningId) {
        this.reasoningId = `${this.streamId}-reasoning-${this.reasoningCount++}`
        controller.enqueue({ type: 'reasoning-start', id: this.reasoningId })
      }
      controller.enqueue({
        type: 'reasoning-delta',
        id: this.reasoningId,
        delta: data.delta,
      })
      return
    }

    this.emitText(controller, this.textFilter.push(data.delta))
  }

  private onToolCall(data: StreamToolCallEvent) {
    const controller = this.controller!

    if (data.phase === 'start' && data.toolName) {
      this.closeReasoning(controller)
      this.textFilter.endTurn()
      this.toolNames.set(data.toolCallId, data.toolName)
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
      this.emittedToolCalls.add(data.toolCallId)
      this.pauseIfAwaitingApproval()
      return
    }

    if (
      data.phase === 'result' &&
      data.output !== undefined &&
      !this.deniedToolCalls.has(data.toolCallId)
    ) {
      controller.enqueue({
        type: 'tool-result',
        toolCallId: data.toolCallId,
        toolName:
          data.toolName ?? this.toolNames.get(data.toolCallId) ?? 'unknown',
        result: parseToolResult(data.output),
      })
    }
  }

  private onComplete(data: StreamCompleteEvent) {
    const controller = this.controller!
    this.endContent(controller)
    controller.enqueue({
      type: 'finish',
      finishReason: convertFinishReason(data.finishReason),
      usage: mapUsage(data.usage),
    })
    this.finish()
    controller.close()
  }

  private onError(data: StreamErrorEvent) {
    const controller = this.controller!
    controller.enqueue({
      type: 'error',
      error: toAdkError(data.error, data.code),
    })
    this.finish()
    controller.close()
  }
}
