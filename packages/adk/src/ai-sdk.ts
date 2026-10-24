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
  type AdkToolParameter,
  type AdkUsageMetadata,
  getNativeAdkEngine,
  type NanoDownloadProgressEvent,
  type StreamToolCallEvent,
  type ToolCallEvent,
} from './NativeAdkEngine'

const DEFAULT_NANO_MODEL = 'gemini-nano'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

export type AdkToolDefinitionSet = Record<string, FullToolDefinition>

/** `gemini-nano` runs on device, any other name is a cloud Gemini model */
export type AdkLanguageModelId = 'gemini-nano' | (string & {})

export interface AdkLanguageModelOptions {
  /** Defaults to `genai-nano`, or `gemini` when `modelName` names a cloud model */
  modelType?: AdkModelType
  /** Defaults to `gemini-nano` on device and `gemini-2.5-flash` in the cloud */
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
  modelType: AdkModelType
  modelName: string
  availability: AdkModelAvailability
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
  /** Downloads and initializes Gemini Nano. No-op for cloud models */
  prepare: () => Promise<void>
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
  /** Whether the device can run Gemini Nano at all. Returns `false` on non-Android */
  isNanoSupported: () => Promise<boolean>
  /**
   * Whether `modelType` can be used now. For `genai-nano`, Gemini Nano must be
   * available or downloadable. Cloud `gemini` resolves to `true` on Android
   */
  isAvailable: (modelType?: AdkModelType) => Promise<boolean>
  /** Availability details for a model type */
  getModelInfo: (options?: {
    modelType?: AdkModelType
    nano?: AdkNanoModelConfig
  }) => Promise<AdkModelInfo>
  /** Downloads and initializes Gemini Nano, reporting download progress */
  prepareNano: (options?: AdkPrepareOptions) => Promise<void>
}

type ResolvedModelOptions = Omit<
  AdkLanguageModelOptions,
  'modelType' | 'modelName'
> & {
  modelType: AdkModelType
  modelName: string
}

function resolveModelOptions(
  defaults: AdkLanguageModelOptions,
  options: AdkLanguageModelId | AdkLanguageModelOptions = {}
): ResolvedModelOptions {
  const overrides =
    typeof options === 'string' ? { modelName: options } : options
  const merged = { ...defaults, ...overrides }
  const modelType =
    merged.modelType ??
    (merged.modelName && merged.modelName !== DEFAULT_NANO_MODEL
      ? 'gemini'
      : 'genai-nano')
  const modelName =
    merged.modelName ??
    (modelType === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_NANO_MODEL)

  return { ...merged, modelType, modelName }
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

async function prepareNano(
  nano: AdkNanoModelConfig | undefined,
  options: AdkPrepareOptions = {}
) {
  const native = getNativeAdkEngine()
  const listener = options.onProgress
    ? native.onNanoDownloadProgress((event: NanoDownloadProgressEvent) => {
        options.onProgress?.({
          phase: event.phase as AdkDownloadProgress['phase'],
          bytesDownloaded: event.bytesDownloaded,
          bytesToDownload: event.bytesToDownload,
        })
      })
    : null

  try {
    await native.prepareNano(nano)
  } catch (error) {
    throw toAdkError(error)
  } finally {
    listener?.remove()
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
  provider.isNanoSupported = async () => {
    if (Platform.OS !== 'android') {
      return false
    }
    return getNativeAdkEngine().isNanoSupported(defaults.nano)
  }
  provider.isAvailable = async (modelType: AdkModelType = 'genai-nano') => {
    if (Platform.OS !== 'android') {
      return false
    }
    return getNativeAdkEngine()
      .isAvailable(modelType, defaults.nano)
      .then(Boolean)
  }
  provider.getModelInfo = async (
    options: { modelType?: AdkModelType; nano?: AdkNanoModelConfig } = {}
  ): Promise<AdkModelInfo> => {
    const resolved = resolveModelOptions(defaults)
    const { modelType, modelName } =
      options.modelType && options.modelType !== resolved.modelType
        ? resolveModelOptions({ modelType: options.modelType })
        : resolved
    const nano = options.nano ?? defaults.nano

    if (Platform.OS !== 'android') {
      return { modelType, modelName, availability: 'unavailable' }
    }

    const info = await getNativeAdkEngine()
      .getModelInfo(modelType, nano)
      .catch((error: unknown) => {
        throw toAdkError(error)
      })
    return {
      modelType,
      modelName,
      availability: toModelAvailability(info.availability),
      baseModelName: info.baseModelName,
      contextSize: info.contextSize,
    }
  }
  provider.prepareNano = (options?: AdkPrepareOptions) =>
    prepareNano(defaults.nano, options)
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

const schemaPropertyToAdkParameter = (
  name: string,
  value: unknown,
  required: boolean
): AdkToolParameter => {
  const schema = value as {
    type?: string
    description?: string
  }

  return {
    name,
    description: schema?.description,
    type: (schema?.type as AdkToolParameter['type']) ?? 'string',
    required,
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

// Gemini Nano often wraps JSON in a Markdown code fence
const jsonFencePrefix = /^\s*```(?:json)?\s*\n?/
const stripJsonFences = (text: string) =>
  text.replace(jsonFencePrefix, '').replace(/\s*```\s*$/, '')

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
    this.modelId = options.modelName
    this.agentConfig = {
      name: options.name ?? 'react_native_adk_agent',
      description: options.description ?? 'React Native ADK agent',
      instruction: options.instruction,
      model: {
        type: options.modelType,
        name: options.modelName,
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

  async prepare(): Promise<void> {
    await this.ensureNanoPrepared()
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
      this.nanoPreparePromise = prepareNano(this.agentConfig.model.nano).catch(
        (error) => {
          this.nanoPreparePromise = null
          throw error
        }
      )
    }

    return this.nanoPreparePromise
  }

  private prepareMessages(
    messages: LanguageModelV4Prompt,
    warnings: SharedV4Warning[]
  ): AdkMessage[] {
    return messages.map((message): AdkMessage => {
      if (message.role === 'system') {
        return {
          role: 'system',
          content: message.content,
        }
      }

      if (message.role === 'user') {
        const parts = message.content.map((part): AdkMessagePart => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text }
          }
          return toFileMessagePart(part)
        })

        if (parts.length === 1 && parts[0]?.type === 'text') {
          return {
            role: 'user',
            content: parts[0].text,
          }
        }

        return {
          role: 'user',
          parts,
        }
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

        return {
          role: 'assistant',
          content,
        }
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

        return {
          role: 'user',
          content,
        }
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
    // Gemini Nano has no response schema, so the schema goes in the instruction
    if (!this.isNano || options.responseFormat?.type !== 'json') {
      return this.agentConfig
    }

    const instruction = [
      this.agentConfig.instruction,
      createNanoJsonInstruction(options.responseFormat.schema),
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
      const unsupported = {
        topP: options.topP,
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
    return tools
      .filter((tool): tool is LanguageModelV4FunctionTool => {
        if (tool.type === 'function') {
          return true
        }
        warnings.push({
          type: 'unsupported',
          feature: `provider-defined tool ${tool.name}`,
        })
        return false
      })
      .map((tool) => {
        const required = Array.isArray(tool.inputSchema.required)
          ? tool.inputSchema.required
          : []
        const properties = tool.inputSchema.properties ?? {}

        const parameters = Object.entries(properties).map(([name, value]) =>
          schemaPropertyToAdkParameter(name, value, required.includes(name))
        )

        const schema = jsonSchema(tool.inputSchema)

        if (!this.tools[tool.name]?.execute) {
          warnings.push({
            type: 'other',
            message: `Tool "${tool.name}" has no executor. Pass it to createAdkProvider via availableTools so ADK can run it.`,
          })
        }

        return {
          native: {
            id: generateId(),
            name: tool.name,
            description: tool.description ?? '',
            inputSchema: tool.inputSchema,
            parameters,
          } satisfies AdkTool,
          execute: async (modelInput: unknown) => {
            const execute = this.tools[tool.name]?.execute
            if (!execute) {
              return {
                error: `Tool "${tool.name}" is not available in this app.`,
              }
            }

            const text =
              typeof modelInput === 'string'
                ? modelInput
                : JSON.stringify(modelInput ?? {})
            const toolCallArguments = await parseJSON({
              text,
              schema,
            })
            const opts: ToolExecutionOptions<unknown> = {
              toolCallId: generateId(),
              messages: [],
              context: undefined,
            }
            return execute(toolCallArguments, opts)
          },
        }
      })
  }

  private prepareCall(options: LanguageModelV4CallOptions) {
    const { tools, warnings } = prepareToolChoice(
      options.tools,
      options.toolChoice
    )
    const messages = this.prepareMessages(options.prompt, warnings)
    const generationOptions = this.prepareGenerationOptions(options, warnings)
    const preparedTools = this.prepareTools(tools, warnings)

    return {
      messages,
      generationOptions,
      preparedTools,
      nativeTools: preparedTools.map((tool) => tool.native),
      ownedToolIds: new Set(preparedTools.map((tool) => tool.native.id)),
      agentConfig: this.prepareAgentConfig(options),
      warnings,
    }
  }

  private registerTools(
    preparedTools: ReturnType<AdkChatLanguageModel['prepareTools']>
  ) {
    globalThis.__ADK_TOOLS__ = globalThis.__ADK_TOOLS__ ?? {}

    for (const tool of preparedTools) {
      globalThis.__ADK_TOOLS__[tool.native.id] = tool.execute
    }
  }

  private unregisterTools(
    preparedTools: ReturnType<AdkChatLanguageModel['prepareTools']>
  ) {
    for (const tool of preparedTools) {
      delete globalThis.__ADK_TOOLS__?.[tool.native.id]
    }
  }

  private createToolCallListener(scope: {
    streamId?: string
    runId?: string
    ownedToolIds: Set<string>
  }) {
    const native = getNativeAdkEngine()

    return native.onToolCall(async (event: ToolCallEvent) => {
      if (scope.streamId !== undefined && event.streamId !== scope.streamId) {
        return
      }
      if (scope.runId !== undefined && event.runId !== scope.runId) {
        return
      }
      if (!scope.ownedToolIds.has(event.toolId)) {
        return
      }

      const executor = globalThis.__ADK_TOOLS__?.[event.toolId]
      if (!executor) {
        native.submitToolResult(
          event.toolCallId,
          JSON.stringify({ error: `Tool not found: ${event.toolId}` })
        )
        return
      }

      try {
        const result = await executor(event.arguments)
        native.submitToolResult(
          event.toolCallId,
          typeof result === 'string' ? result : JSON.stringify(result ?? {})
        )
      } catch (error) {
        native.submitToolResult(
          event.toolCallId,
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          })
        )
      }
    })
  }

  async doGenerate(options: LanguageModelV4CallOptions) {
    const {
      messages,
      generationOptions,
      preparedTools,
      nativeTools,
      ownedToolIds,
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

    this.registerTools(preparedTools)
    const toolListener = this.createToolCallListener({ runId, ownedToolIds })
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
      content.push({
        type: 'text',
        text:
          options.responseFormat?.type === 'json'
            ? stripJsonFences(response.content)
            : response.content,
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
      this.unregisterTools(preparedTools)
    }
  }

  async doStream(options: LanguageModelV4CallOptions) {
    const {
      messages,
      generationOptions,
      preparedTools,
      nativeTools,
      ownedToolIds,
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

    this.registerTools(preparedTools)

    let listeners: { remove(): void }[] = []
    let cleanedUp = false
    const toolListener = this.createToolCallListener({ streamId, ownedToolIds })
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
      this.unregisterTools(preparedTools)
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
        // JSON mode keeps the full text so code fences can be stripped
        let rawText = ''
        let emittedText = ''

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

        const emitJsonText = (final: boolean) => {
          const stripped = final
            ? stripJsonFences(rawText)
            : // Hold back trailing backticks that could start a closing fence
              rawText.replace(jsonFencePrefix, '').replace(/\s*`{1,3}$/, '')
          // Only emit once the opening fence can no longer change the prefix
          if (!final && /^\s*`{0,3}(j(s(o(n)?)?)?)?$/.test(rawText)) {
            return
          }
          if (stripped.startsWith(emittedText)) {
            emitText(stripped.slice(emittedText.length))
            emittedText = stripped
          }
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

            if (isJson) {
              rawText += data.delta
              emitJsonText(false)
              return
            }

            emitText(data.delta)
          })
        )

        addListener(
          native.onStreamToolCall((data: StreamToolCallEvent) => {
            if (data.streamId !== streamId) {
              return
            }

            if (data.phase === 'start' && data.toolName) {
              closeReasoning()
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
            if (isJson) {
              emitJsonText(true)
            }
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
