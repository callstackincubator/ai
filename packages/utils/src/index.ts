import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Message,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider'

export interface HistorySummarizationOptions {
  /**
   * Prompt size in tokens above which turns before the latest user message
   * are folded into the summary. Also caps the input of each summarizer call.
   */
  threshold: number
  /**
   * Model that writes the summary. Its `countTokens` method, when it has one,
   * measures the prompt.
   */
  model: LanguageModelV4
}

export interface HistoryManagementOptions {
  /**
   * Summarize older messages instead of dropping them, and compact the prompt
   * when it exceeds the token threshold.
   */
  summarizeHistory?: HistorySummarizationOptions
  /**
   * Keep system messages and the last N non-system messages. The latest user
   * turn is always kept whole.
   */
  rollingWindowMessages?: number
  /**
   * Remove tool calls and tool results of turns before the latest user message.
   */
  dropCompletedToolCalls?: boolean
}

type LanguageModelLikeResult = Awaited<
  ReturnType<LanguageModelV4['doGenerate']>
>

type TokenCountCapableLanguageModel = LanguageModelV4 & {
  countTokens?: (text: string) => Promise<number>
}

type MessageContentPart = Extract<
  LanguageModelV4Message['content'],
  readonly unknown[]
>[number]

type SystemMessage = Extract<LanguageModelV4Message, { role: 'system' }>

interface CachedSummary {
  messages: string[]
  summary: string
}

const SUMMARY_MAX_OUTPUT_TOKENS = 400

// Keyed by the summarizer model, so the summary survives wrapping the model
// again for every request
const summaryCache = new WeakMap<LanguageModelV4, CachedSummary>()

interface HistorySplit {
  systemMessages: SystemMessage[]
  conversation: LanguageModelV4Message[]
  windowStart: number
  currentTurnStart: number
}

function splitHistory(
  prompt: LanguageModelV4Prompt,
  options: HistoryManagementOptions
): HistorySplit {
  const messages = options.dropCompletedToolCalls
    ? dropCompletedToolCallMessages(prompt)
    : prompt
  const systemMessages = messages.filter(
    (message): message is SystemMessage => message.role === 'system'
  )
  const conversation = messages.filter((message) => message.role !== 'system')
  const currentTurnStart = findCurrentTurnStart(conversation)
  const windowStart =
    options.rollingWindowMessages && options.rollingWindowMessages > 0
      ? findWindowStart(
          conversation,
          currentTurnStart,
          options.rollingWindowMessages
        )
      : 0

  return { systemMessages, conversation, windowStart, currentTurnStart }
}

/**
 * Index of the latest user message, where the turn being answered starts.
 * Tool steps of that turn follow it and must stay together.
 */
function findCurrentTurnStart(messages: LanguageModelV4Message[]): number {
  const index = findLastIndex(messages, (message) => message.role === 'user')
  return index === -1 ? 0 : index
}

function findWindowStart(
  conversation: LanguageModelV4Message[],
  currentTurnStart: number,
  windowSize: number
): number {
  let start = Math.max(
    0,
    Math.min(conversation.length - windowSize, currentTurnStart)
  )

  // Tool results whose call fell outside the window would be orphaned
  while (start < currentTurnStart && conversation[start].role === 'tool') {
    start += 1
  }

  return start
}

function dropCompletedToolCallMessages(
  messages: LanguageModelV4Prompt
): LanguageModelV4Prompt {
  const currentTurnStart = findCurrentTurnStart(messages)

  return messages.flatMap((message, index): LanguageModelV4Message[] => {
    if (index >= currentTurnStart || message.role === 'system') {
      return [message]
    }

    if (message.role === 'tool') {
      return []
    }

    if (message.role !== 'assistant') {
      return [message]
    }

    const content = message.content.filter(
      (part) => part.type !== 'tool-call' && part.type !== 'tool-result'
    )

    return content.length > 0 ? [{ ...message, content }] : []
  })
}

function findLastIndex<T>(
  items: T[],
  predicate: (item: T, index: number) => boolean
) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index)) {
      return index
    }
  }

  return -1
}

async function countTokens(
  text: string,
  model: LanguageModelV4
): Promise<number> {
  if (!text.trim()) {
    return 0
  }

  const tokenCountModel = model as TokenCountCapableLanguageModel

  // Called on the model, since providers read their own state in countTokens
  if (typeof tokenCountModel.countTokens === 'function') {
    try {
      return await tokenCountModel.countTokens(text)
    } catch {
      return estimateTokenCount(text)
    }
  }

  return estimateTokenCount(text)
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Folds messages into a running summary. The summary of an earlier call is
 * reused when its messages are still the start of the history, so each new
 * turn only summarizes what changed since.
 */
async function summarizeMessages(
  messages: LanguageModelV4Message[],
  { model, threshold }: HistorySummarizationOptions,
  abortSignal: AbortSignal | undefined
): Promise<string> {
  const serialized = messages.map(serializeMessage)
  const cached = summaryCache.get(model)
  const reusable =
    cached !== undefined &&
    cached.messages.length <= serialized.length &&
    cached.messages.every((message, index) => message === serialized[index])

  let summary = reusable ? cached.summary : ''
  const pending = serialized.slice(reusable ? cached.messages.length : 0)

  // Summarize in chunks that fit the threshold, so a long history does not
  // overflow the summarizer's own context
  let chunk: string[] = []
  let chunkTokens = await countTokens(summary, model)
  for (const message of pending) {
    const messageTokens = await countTokens(message, model)
    if (chunk.length > 0 && chunkTokens + messageTokens > threshold) {
      summary = await summarizeChunk(model, summary, chunk, abortSignal)
      chunk = []
      chunkTokens = await countTokens(summary, model)
    }
    chunk.push(message)
    chunkTokens += messageTokens
  }

  if (chunk.length > 0) {
    summary = await summarizeChunk(model, summary, chunk, abortSignal)
  }

  if (summary) {
    summaryCache.set(model, { messages: serialized, summary })
  }

  return summary
}

async function summarizeChunk(
  model: LanguageModelV4,
  previousSummary: string,
  messages: string[],
  abortSignal: AbortSignal | undefined
): Promise<string> {
  const result = await model.doGenerate({
    prompt: buildSummaryPrompt(previousSummary, messages),
    maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
    abortSignal,
  } as LanguageModelV4CallOptions)

  return extractTextFromGenerationResult(result).trim() || previousSummary
}

function buildSummaryPrompt(
  previousSummary: string,
  messages: string[]
): LanguageModelV4Prompt {
  const transcript = messages.join('\n\n')

  return [
    {
      role: 'system',
      content: `Summarize the conversation in <conversation> for continued assistant use. Preserve user goals, constraints, factual details, decisions, unresolved questions, and tool outcomes. Be concise and structured.${previousSummary ? ' Merge it with the earlier summary in <summary> into one updated summary.' : ''}`,
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          // Tagged, since small models given a bare transcript continue the
          // conversation instead of summarizing it
          text: `${previousSummary ? `<summary>\n${previousSummary}\n</summary>\n\n` : ''}<conversation>\n${transcript}\n</conversation>`,
        },
      ],
    },
  ]
}

/**
 * Adds the summary to the last system message, since some chat templates
 * accept only one
 */
function withSummary(
  systemMessages: SystemMessage[],
  summary: string
): SystemMessage[] {
  const summaryText = `Summary of earlier conversation:\n${summary}`
  const lastSystemMessage = systemMessages[systemMessages.length - 1]

  if (!lastSystemMessage) {
    return [{ role: 'system', content: summaryText }]
  }

  return [
    ...systemMessages.slice(0, -1),
    {
      ...lastSystemMessage,
      content: `${lastSystemMessage.content}\n\n${summaryText}`,
    },
  ]
}

function serializeMessages(messages: LanguageModelV4Message[]): string {
  return messages.map(serializeMessage).join('\n\n')
}

function serializeMessage(message: LanguageModelV4Message): string {
  const content = Array.isArray(message.content)
    ? message.content.map(serializeMessageContentPart).join('\n')
    : message.content

  return `${message.role.toUpperCase()}: ${content}`
}

function serializeKnownMessageContentPart(
  part: MessageContentPart
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

function serializeMessageContentPart(part: MessageContentPart): string {
  return serializeKnownMessageContentPart(part) ?? `[${part.type}]`
}

function extractTextFromGenerationResult(
  result: LanguageModelLikeResult
): string {
  return result.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
}

/**
 * Applies `dropCompletedToolCalls` and `rollingWindowMessages` without
 * summarizing. Messages outside the window are dropped.
 */
export function trimMessagesForHistory(
  messages: LanguageModelV4Prompt,
  options: HistoryManagementOptions = {}
): LanguageModelV4Prompt {
  const { systemMessages, conversation, windowStart } = splitHistory(
    messages,
    options
  )

  return [...systemMessages, ...conversation.slice(windowStart)]
}

export async function applyHistoryManagement(
  prompt: LanguageModelV4Prompt,
  options: HistoryManagementOptions | undefined,
  abortSignal?: AbortSignal
): Promise<LanguageModelV4Prompt> {
  if (!options) {
    return prompt
  }

  const { systemMessages, conversation, windowStart, currentTurnStart } =
    splitHistory(prompt, options)
  const summarizeHistory =
    options.summarizeHistory && options.summarizeHistory.threshold > 0
      ? options.summarizeHistory
      : undefined

  let keepFrom = windowStart

  if (summarizeHistory && keepFrom < currentTurnStart) {
    const promptTokenCount = await countTokens(
      serializeMessages([...systemMessages, ...conversation.slice(keepFrom)]),
      summarizeHistory.model
    )
    if (promptTokenCount > summarizeHistory.threshold) {
      keepFrom = currentTurnStart
    }
  }

  const keptMessages = conversation.slice(keepFrom)

  if (!summarizeHistory || keepFrom === 0) {
    return [...systemMessages, ...keptMessages]
  }

  const summary = await summarizeMessages(
    conversation.slice(0, keepFrom),
    summarizeHistory,
    abortSignal
  )

  return [
    ...(summary ? withSummary(systemMessages, summary) : systemMessages),
    ...keptMessages,
  ]
}

export function wrapLanguageModelWithHistory<TModel extends LanguageModelV4>(
  model: TModel,
  options: HistoryManagementOptions
): TModel {
  return new Proxy(model, {
    get(target, prop, receiver) {
      if (prop === 'doGenerate') {
        return async (callOptions: LanguageModelV4CallOptions) => {
          const prompt = await applyHistoryManagement(
            callOptions.prompt,
            options,
            callOptions.abortSignal
          )
          return target.doGenerate.call(target, {
            ...callOptions,
            prompt,
          })
        }
      }

      if (prop === 'doStream') {
        return async (callOptions: LanguageModelV4CallOptions) => {
          const prompt = await applyHistoryManagement(
            callOptions.prompt,
            options,
            callOptions.abortSignal
          )
          return target.doStream.call(target, {
            ...callOptions,
            prompt,
          })
        }
      }

      return Reflect.get(target, prop, receiver)
    },
  })
}
