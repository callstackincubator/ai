import type { SharedV4Warning } from '@ai-sdk/provider'
import type {
  getDeviceInfo,
  LiteRTLMInstance,
  LLMConfig,
  Message,
  ModelDownloadOptions,
  MultimodalPart,
  resolveFromManifest,
  toolResultPart,
} from 'react-native-litert-lm'

import type {
  GenerationRequest,
  GenerationResult,
  LiteRTRuntime,
  OutputChunk,
} from './backend'
import {
  createAbortError,
  errorMessage,
  LiteRTError,
  type LiteRTErrorCode,
} from './errors'
import {
  type HuggingFaceRef,
  parseHuggingFaceId,
  parseTree,
  type RepoFile,
  resolveUrl,
  selectKeptFile,
  selectRepoFile,
  treeUrl,
} from './huggingFace'
import { type Channel, DEFAULT_CHANNELS, OutputParser } from './outputParser'
import {
  canonicalJson,
  type ToolSpec,
  transcriptKey,
  type Turn,
  withJsonInstruction,
} from './prompt'
import type { LiteRTModelSettings, LiteRTPrepareOptions } from './types'

type ExecuteOptions = NonNullable<Parameters<LiteRTLMInstance['execute']>[2]>

/** The parts of `react-native-litert-lm` the runtime uses. Replaced in tests. */
export interface LiteRTBinding {
  createLLM(): LiteRTLMInstance
  getDeviceInfo: typeof getDeviceInfo
  /** The names of the files already downloaded. */
  listKeptFiles(): string[]
  resolveFromManifest: typeof resolveFromManifest
  toolResultPart: typeof toolResultPart
}

interface LoadedModel {
  llm: LiteRTLMInstance
  /** The configuration the engine holds. Part of it can only change with a reload. */
  configKey: string
}

/** What the model holds in its conversation, to skip replaying it on the next call. */
interface ConversationState {
  system: string | undefined
  /** Identifies every turn the engine holds, the model's last answer included. */
  key: string
}

function historyMessage(turn: Turn): Message[] {
  switch (turn.role) {
    case 'user':
      return [{ role: 'user', content: turn.text }]
    case 'assistant':
      return [
        {
          role: 'model',
          content: turn.text,
          toolCalls:
            turn.toolCalls.length > 0
              ? turn.toolCalls.map((call) => ({
                  name: call.name,
                  argumentsJson:
                    typeof call.arguments === 'string'
                      ? call.arguments
                      : JSON.stringify(call.arguments ?? {}),
                }))
              : undefined,
        },
      ]
    case 'tool':
      return turn.results.map((result) => ({
        role: 'tool',
        content: JSON.stringify(result.value) ?? 'null',
        toolName: result.name,
      }))
  }
}

function toNativeTools(tools: ToolSpec[]): LLMConfig['tools'] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    parametersJson: JSON.stringify(tool.parameters ?? {}),
  }))
}

function toLiteRTError(
  error: unknown,
  phase: 'load' | 'generate'
): LiteRTError {
  if (error instanceof LiteRTError) return error
  const message = errorMessage(error)
  const code = (error as { code?: unknown } | null)?.code
  const known: Record<string, LiteRTErrorCode> = {
    MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
    INVALID_MODEL: 'INVALID_MODEL',
    MODEL_TYPE_MISMATCH: 'INVALID_MODEL',
    DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
    OUT_OF_MEMORY: 'OUT_OF_MEMORY',
    MEMORY_ESTIMATE_EXCEEDED: 'OUT_OF_MEMORY',
    RUNTIME_TOO_OLD: 'RUNTIME_TOO_OLD',
    ENGINE_INIT_FAILED: 'LOAD_FAILED',
    INVALID_CONFIG: 'LOAD_FAILED',
    MODEL_NOT_LOADED: 'LOAD_FAILED',
  }
  // The binding reads the engine's NOT_FOUND as a missing file, but it also means a file
  // that exists and lacks a section the engine needs: a truncated download, for example.
  if (
    (code === 'MODEL_NOT_FOUND' && message.includes('Failed to create')) ||
    message.includes('Invalid magic number') ||
    message.includes('Unsupported or unknown file format')
  ) {
    return new LiteRTError('INVALID_MODEL', message, error)
  }
  if (message.includes('Input token ids are too long')) {
    return new LiteRTError('CONTEXT_TOO_LONG', message, error)
  }
  if (
    code === 'DOWNLOAD_FAILED' &&
    /\bHTTP (401|403|404|410)\b/.test(message)
  ) {
    return new LiteRTError('MODEL_NOT_FOUND', message, error)
  }
  const mapped = typeof code === 'string' ? known[code] : undefined
  return new LiteRTError(
    mapped ?? (phase === 'load' ? 'LOAD_FAILED' : 'GENERATION_FAILED'),
    message,
    error
  )
}

function isCancellation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'INFERENCE_CANCELLED'
}

/** The engine reports a failed stream as a last token, after the promise has the error. */
const ERROR_TOKEN = /^Error: /

/** What `react-native-litert-lm` stops a reply at when nothing sets `maxOutputTokens`. */
const DEFAULT_MAX_OUTPUT_TOKENS = 1024

/** The engine constrains output to a schema, leaving no way to call a tool. It has no "any JSON". */
function usesConstraint(request: GenerationRequest): boolean {
  return (
    request.jsonSchema !== undefined &&
    request.jsonSchema !== '' &&
    request.tools.length === 0
  )
}

/** Wait for the work, or reject as soon as the signal aborts, leaving the work to finish. */
function untilAborted<T>(
  work: Promise<T>,
  signal: AbortSignal | undefined
): Promise<T> {
  if (signal === undefined) return work
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError())
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}

export function createRuntime(
  modelId: string,
  settings: LiteRTModelSettings,
  binding: LiteRTBinding
): LiteRTRuntime {
  let loaded: LoadedModel | undefined
  let conversation: ConversationState | undefined
  let modelPath: string | undefined
  let manifestConfig: Partial<LLMConfig> = {}
  let channels: Channel[] = DEFAULT_CHANNELS
  let downloadOptions: ModelDownloadOptions | undefined

  const headers: Record<string, string> | undefined =
    settings.accessToken !== undefined
      ? { Authorization: `Bearer ${settings.accessToken}` }
      : undefined

  /** The Hub didn't answer, as with no network: a file from this repo that's here still loads. */
  const pickKeptFile = (ref: HuggingFaceRef): boolean => {
    const file = selectKeptFile(
      binding.listKeptFiles(),
      ref.repo,
      settings.backend,
      binding.getDeviceInfo().platform
    )
    if (file === undefined) return false
    console.warn(
      `Could not ask the Hub about ${ref.repo}, so this loads ${file.path}, already on the phone.`
    )
    modelPath = resolveUrl(ref, file.path)
    downloadOptions = { headers, sha256: settings.sha256 }
    return true
  }

  /**
   * A named file's hash, when the Hub answers. The phone keeps one file per name, and the hash
   * is what tells it from another revision's or another repo's file of the same name.
   */
  const hashFromHub = async (
    ref: HuggingFaceRef,
    path: string,
    signal?: AbortSignal
  ): Promise<string | undefined> => {
    const slash = path.lastIndexOf('/')
    try {
      const response = await fetch(
        treeUrl(ref, slash === -1 ? undefined : path.slice(0, slash)),
        { headers, signal }
      )
      if (!response.ok) return undefined
      return parseTree(await response.json()).find((file) => file.path === path)
        ?.sha256
    } catch {
      if (signal?.aborted) throw createAbortError()
      return undefined
    }
  }

  /** The file to load: a local path, a URL, or the file chosen from a Hugging Face repo. */
  const resolveSource = async (signal?: AbortSignal): Promise<void> => {
    if (modelPath !== undefined) return
    const ref: HuggingFaceRef | undefined = parseHuggingFaceId(modelId)
    if (ref === undefined) {
      modelPath = modelId
      downloadOptions = { headers, sha256: settings.sha256 }
      return
    }
    if (ref.path !== undefined) {
      const sha256 =
        settings.sha256 ?? (await hashFromHub(ref, ref.path, signal))
      modelPath = resolveUrl(ref, ref.path)
      downloadOptions = { headers, sha256 }
      return
    }

    // A repo can say which file and settings fit each phone. Never throws: null means no manifest.
    const fromManifest = await binding.resolveFromManifest(ref.repo, {
      revision: ref.revision,
      backend: settings.backend,
      signal,
    })
    if (signal?.aborted) throw createAbortError()
    if (fromManifest !== null) {
      modelPath = fromManifest.url
      manifestConfig = fromManifest.config
      channels = fromManifest.streamChannels.map((channel) => ({
        type: channel.type === 'toolCall' ? 'tool-call' : 'reasoning',
        start: channel.start,
        end: channel.end,
      }))
      downloadOptions = {
        headers,
        sha256: settings.sha256 ?? fromManifest.sha256,
      }
      return
    }

    let response: Response
    try {
      response = await fetch(treeUrl(ref), { headers, signal })
    } catch (error) {
      if (signal?.aborted) throw createAbortError()
      if (pickKeptFile(ref)) return
      throw new LiteRTError(
        'DOWNLOAD_FAILED',
        `Could not list the files of ${ref.repo}: ${errorMessage(error)}`,
        error
      )
    }
    if (
      (response.status === 429 || response.status >= 500) &&
      pickKeptFile(ref)
    )
      return
    if (!response.ok) {
      throw new LiteRTError(
        response.status === 404 || response.status === 401
          ? 'MODEL_NOT_FOUND'
          : 'DOWNLOAD_FAILED',
        `Could not list the files of ${ref.repo}: HTTP ${response.status}. Check the repo name; a gated or private repo needs accessToken.`
      )
    }
    let files: RepoFile[]
    try {
      files = parseTree(await response.json())
    } catch (error) {
      if (signal?.aborted) throw createAbortError()
      // A page in place of the list, from a network that wants a sign-in, is no answer either.
      if (pickKeptFile(ref)) return
      throw new LiteRTError(
        'DOWNLOAD_FAILED',
        `Could not read the list of files of ${ref.repo}: ${errorMessage(error)}`,
        error
      )
    }
    const file = selectRepoFile(
      files,
      ref.repo,
      settings.backend,
      binding.getDeviceInfo().platform
    )
    if (file === undefined) {
      const names = files
        .map((f) => f.path)
        .filter((path) => path.endsWith('.litertlm'))
      throw new LiteRTError(
        'MODEL_NOT_FOUND',
        names.length === 0
          ? `${ref.repo} has no .litertlm file.`
          : `${ref.repo} has no .litertlm file for this backend. Name one in the model id: hf://${ref.repo}/${names[0]}`
      )
    }
    modelPath = resolveUrl(ref, file.path)
    downloadOptions = { headers, sha256: settings.sha256 ?? file.sha256 }
  }

  const buildConfig = (request: GenerationRequest): LLMConfig => {
    const config: LLMConfig = {
      ...manifestConfig,
      ...(settings.backend !== undefined ? { backend: settings.backend } : {}),
      ...(settings.maxContextTokens !== undefined
        ? { maxContextTokens: settings.maxContextTokens }
        : {}),
      ...(settings.speculativeDecoding !== undefined
        ? { enableSpeculativeDecoding: settings.speculativeDecoding }
        : {}),
    }
    const temperature = request.temperature ?? settings.temperature
    const topK = request.topK ?? settings.topK
    const topP = request.topP ?? settings.topP
    if (temperature !== undefined) config.temperature = temperature
    if (topK !== undefined) config.topK = topK
    if (topP !== undefined) config.topP = topP
    if (request.tools.length > 0) config.tools = toNativeTools(request.tools)
    if (usesConstraint(request)) config.enableStructuredOutput = true
    return config
  }

  /** The configuration a request needs, once any setting that can't change per call is known. */
  const configKey = (config: LLMConfig) => canonicalJson(config)

  const release = async (): Promise<void> => {
    const llm = loaded?.llm
    loaded = undefined
    conversation = undefined
    if (llm !== undefined) {
      await llm.unload().catch(() => {})
      llm.close()
    }
  }

  /** The system can take a loaded engine's memory back, and then the model has to load again. */
  const forgetIfFreed = async (): Promise<void> => {
    if (loaded !== undefined && !loaded.llm.isReady()) await release()
  }

  const load = async (
    config: LLMConfig,
    key: string,
    options?: LiteRTPrepareOptions
  ): Promise<void> => {
    const onProgress = options?.onProgress ?? settings.onProgress
    const signal = options?.abortSignal
    // A new instance, with the old engine gone first: an instance keeps sampling values that
    // a new config leaves unset, and the binding's memory check counts a loaded engine as used.
    await release()
    const llm = binding.createLLM()
    let abandoned = false
    const finished = llm
      .loadModel(modelPath as string, config, {
        ...downloadOptions,
        onProgress: onProgress
          ? (fraction) => {
              if (!abandoned) onProgress({ fraction })
            }
          : undefined,
      })
      .then(
        () => {
          if (abandoned) return
          loaded = { llm, configKey: key }
          conversation = undefined
        },
        (error: unknown) => {
          if (abandoned) return
          llm.close()
          throw toLiteRTError(error, 'load')
        }
      )
    try {
      await untilAborted(finished, signal)
    } catch (error) {
      if (signal?.aborted) {
        // The binding can't stop a download. With the instance closed no engine loads into it,
        // and the download goes on for the next call to join.
        abandoned = true
        llm.close()
      }
      throw error
    }
  }

  const describeReload = (request: GenerationRequest): string => {
    const reasons: string[] = []
    if (request.tools.length > 0) reasons.push('tools')
    if (
      request.temperature !== undefined ||
      request.topK !== undefined ||
      request.topP !== undefined
    ) {
      reasons.push('sampling')
    }
    if (usesConstraint(request)) reasons.push('structured output')
    const what = reasons.length > 0 ? reasons.join(' and ') : 'its settings'
    return `The model reloads for this call because ${what} changed: these apply when the model loads. Use the same values on every call to avoid the reload.`
  }

  return {
    warningsFor(request) {
      const warnings: SharedV4Warning[] = []
      if (request.seed !== undefined) {
        warnings.push({ type: 'unsupported', feature: 'seed' })
      }
      if (
        loaded !== undefined &&
        configKey(buildConfig(request)) !== loaded.configKey
      ) {
        warnings.push({ type: 'other', message: describeReload(request) })
      }
      if (request.jsonSchema !== undefined && !usesConstraint(request)) {
        warnings.push({
          type: 'compatibility',
          feature: 'structured output',
          details:
            request.jsonSchema === ''
              ? 'The engine constrains output only to a schema, so the request for JSON goes to the model as an instruction and the output is not guaranteed to be JSON.'
              : 'A model constrained to a schema can not call a tool, so with tools the schema goes to the model as an instruction and the output is not guaranteed to match.',
        })
      }
      return warnings
    },

    async prepare(options) {
      const signal = options?.abortSignal
      if (signal?.aborted) throw createAbortError()
      await resolveSource(signal)
      await forgetIfFreed()
      if (loaded !== undefined) return
      const config = buildConfig({
        conversation: {
          system: undefined,
          history: [],
          final: { role: 'user', text: '' },
        },
        tools: [],
      })
      await load(config, configKey(config), options)
    },

    async generate(request, onChunk, abortSignal) {
      if (abortSignal?.aborted) throw createAbortError()
      await resolveSource(abortSignal)
      await forgetIfFreed()

      const config = buildConfig(request)
      const key = configKey(config)
      const wasLoaded = loaded !== undefined
      let reloaded = false
      if (loaded?.configKey !== key) {
        reloaded = wasLoaded
        await load(config, key, { abortSignal })
      }
      if (abortSignal?.aborted) throw createAbortError()
      const llm = (loaded as LoadedModel).llm

      const { history, final } = request.conversation
      const system =
        request.jsonSchema !== undefined && !usesConstraint(request)
          ? withJsonInstruction(request.conversation.system, request.jsonSchema)
          : request.conversation.system
      const historyKey = transcriptKey(system, history)
      const continued = conversation?.key === historyKey
      // A failure or a cancel below leaves the engine's conversation unknown.
      conversation = undefined
      if (!continued) {
        const messages = history.flatMap(historyMessage)
        try {
          llm.resetConversation(
            messages.length > 0 ? JSON.stringify(messages) : undefined,
            system
          )
        } catch (error) {
          throw toLiteRTError(error, 'generate')
        }
      }

      const parts: MultimodalPart[] =
        final.role === 'user'
          ? [{ type: 'text', text: final.text }]
          : final.results.map((result) =>
              binding.toolResultPart(result.name, result.value)
            )

      const options: ExecuteOptions = {}
      if (request.maxOutputTokens !== undefined)
        options.maxOutputTokens = request.maxOutputTokens
      if (request.frequencyPenalty !== undefined)
        options.frequencyPenalty = request.frequencyPenalty
      if (request.presencePenalty !== undefined)
        options.presencePenalty = request.presencePenalty
      if (usesConstraint(request)) options.responseSchema = request.jsonSchema
      // Off unless the call asks: the binding never hands thoughts to JS, so a model that
      // thinks by default would spend the output budget on text nobody can read.
      options.thinking = { enabled: request.thinking ?? false }

      let text = ''
      let rawOutput = ''
      let tokens = 0
      const toolCalls: Extract<OutputChunk, { type: 'tool-call' }>[] = []
      const parser = new OutputParser(
        // Without tools, a marker the model writes is only text.
        request.tools.length > 0
          ? channels
          : channels.filter((c) => c.type !== 'tool-call'),
        (chunk) => {
          if (chunk.type === 'text') text += chunk.text
          if (chunk.type === 'tool-call') toolCalls.push(chunk)
          onChunk(chunk)
        }
      )

      let aborted = false
      const onAbort = () => {
        aborted = true
        // Resetting is how the binding cancels a message in progress.
        try {
          llm.resetConversation()
        } catch {
          // Nothing to cancel.
        }
      }
      abortSignal?.addEventListener('abort', onAbort)

      try {
        await llm.execute(
          parts,
          (token, done) => {
            if (aborted) return
            if (done && ERROR_TOKEN.test(token)) return
            if (token.length > 0) {
              tokens += 1
              rawOutput += token
              parser.push(token)
            }
            if (done) parser.finish()
          },
          options
        )
      } catch (error) {
        if (aborted) throw createAbortError()
        if (isCancellation(error)) {
          // Nothing here cancelled it, so the system took the engine's memory back.
          await release()
          throw new LiteRTError(
            'OUT_OF_MEMORY',
            'The system freed the engine while it was generating. The next call loads the model again.',
            error
          )
        }
        throw toLiteRTError(error, 'generate')
      } finally {
        abortSignal?.removeEventListener('abort', onAbort)
      }
      if (aborted) throw createAbortError()

      // The engine now holds the history, the final turn and this answer.
      conversation = {
        system,
        key: transcriptKey(system, [
          ...history,
          final,
          {
            role: 'assistant',
            text,
            toolCalls: toolCalls.map((call) => ({
              name: call.name,
              arguments: safeParse(call.argumentsJson),
            })),
          },
        ]),
      }

      const usage = readUsage(llm, rawOutput, tokens)
      const limit =
        request.maxOutputTokens ??
        config.maxOutputTokens ??
        DEFAULT_MAX_OUTPUT_TOKENS
      return {
        continued,
        reloaded,
        ...usage,
        // Thoughts never reach JavaScript, so no text at all means they used up the limit.
        cutOff:
          Math.max(tokens, usage.outputTokens ?? 0) >= limit ||
          (request.thinking === true && tokens === 0),
      }
    },

    unload: release,
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json) as unknown
  } catch {
    return json
  }
}

function readUsage(
  llm: LiteRTLMInstance,
  rawOutput: string,
  tokens: number
): Pick<
  GenerationResult,
  'inputTokens' | 'outputTokens' | 'tokensPerSecond' | 'timeToFirstTokenMs'
> {
  // What the engine streamed, one piece a token. Android's stats estimate from characters.
  const usage: ReturnType<typeof readUsage> = { outputTokens: tokens }
  try {
    const stats = llm.getStats()
    usage.tokensPerSecond = stats.tokensPerSecond
    usage.timeToFirstTokenMs = stats.timeToFirstToken
    usage.inputTokens = Math.round(stats.promptTokens)
    // The bundle's tokenizer is better still, where the binding can use it.
    const counted = llm.countTokens(rawOutput)
    const held = llm.getContextTokenCount()
    if (counted >= 0) {
      usage.outputTokens = counted
      if (held >= counted) usage.inputTokens = held - counted
    } else {
      // Android's rate is characters over the whole call, the wait for the first token included.
      const generatingMs = stats.totalTime - stats.timeToFirstToken
      usage.tokensPerSecond =
        tokens > 1 && generatingMs > 0
          ? ((tokens - 1) * 1000) / generatingMs
          : undefined
    }
  } catch {
    // The rest stays unknown.
  }
  return usage
}
