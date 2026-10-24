import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Message,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider'

export interface HistorySummarizationOptions {
  threshold: number
  model: LanguageModelV3
}

export interface HistoryManagementOptions {
  /**
   * Summarize older messages when the prompt token count exceeds the threshold.
   */
  summarizeHistory?: HistorySummarizationOptions
  /**
   * Keep system messages and only the last N non-system messages.
   */
  rollingWindowMessages?: number
  /**
   * Remove completed tool-call/tool-result entries from older context.
   */
  dropCompletedToolCalls?: boolean
}

type LanguageModelLikeResult = Awaited<
  ReturnType<LanguageModelV3['doGenerate']>
>

type TokenCountCapableLanguageModel = LanguageModelV3 & {
  countTokens?: (text: string) => Promise<number>
}

type MessageContentPart = Extract<
  LanguageModelV3Message['content'],
  readonly unknown[]
>[number]

async function summarizePromptHistory(
  prompt: LanguageModelV3Prompt,
  threshold: number,
  summarizerModel: LanguageModelV3
): Promise<LanguageModelV3Prompt> {
  if (threshold <= 0) {
    return prompt
  }

  const promptTokenCount = await countPromptTokens(prompt, summarizerModel)

  if (promptTokenCount <= threshold) {
    return prompt
  }

  const systemMessages = prompt.filter((message) => message.role === 'system')
  const conversationMessages = prompt.filter(
    (message) => message.role !== 'system'
  )

  if (conversationMessages.length <= 2) {
    return prompt
  }

  const latestMessage = conversationMessages[conversationMessages.length - 1]
  const messagesToSummarize = conversationMessages.slice(0, -1)

  if (messagesToSummarize.length === 0) {
    return prompt
  }

  const summaryPrompt = buildSummaryPrompt(messagesToSummarize)
  const summaryResult = await summarizerModel.doGenerate({
    prompt: summaryPrompt,
    maxOutputTokens: 400,
  } as LanguageModelV3CallOptions)
  const summaryText = extractTextFromGenerationResult(summaryResult).trim()

  if (!summaryText) {
    return prompt
  }

  return [
    ...systemMessages,
    {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: `Summary of earlier conversation:\n${summaryText}`,
        },
      ],
    },
    latestMessage,
  ]
}

async function countPromptTokens(
  prompt: LanguageModelV3Prompt,
  model: LanguageModelV3
): Promise<number> {
  const serializedPrompt = serializePromptForSummary(prompt)
  const countTokens = (model as TokenCountCapableLanguageModel).countTokens

  if (typeof countTokens === 'function') {
    try {
      return await countTokens(serializedPrompt)
    } catch {
      return estimateTokenCount(serializedPrompt)
    }
  }

  return estimateTokenCount(serializedPrompt)
}

function estimateTokenCount(text: string): number {
  if (!text.trim()) {
    return 0
  }

  return Math.ceil(text.length / 4)
}

function buildSummaryPrompt(
  messages: LanguageModelV3Prompt
): LanguageModelV3Prompt {
  return [
    {
      role: 'system',
      content:
        'Summarize the conversation history for continued assistant use. Preserve user goals, constraints, factual details, decisions, unresolved questions, and tool outcomes. Be concise and structured.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: serializePromptForSummary(messages),
        },
      ],
    },
  ]
}

function serializePromptForSummary(messages: LanguageModelV3Prompt): string {
  return messages
    .map((message) => {
      const content = Array.isArray(message.content)
        ? message.content.map(serializeMessageContentPart).join('\n')
        : message.content

      return `${message.role.toUpperCase()}: ${content}`
    })
    .join('\n\n')
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

export function trimMessagesForHistory(
  messages: LanguageModelV3Prompt,
  options: HistoryManagementOptions = {}
): LanguageModelV3Prompt {
  let nextMessages = messages

  if (options.dropCompletedToolCalls) {
    nextMessages = dropCompletedToolCallMessages(nextMessages)
  }

  if (options.rollingWindowMessages && options.rollingWindowMessages > 0) {
    const systemMessages = nextMessages.filter(
      (message) => message.role === 'system'
    )
    const conversationMessages = nextMessages.filter(
      (message) => message.role !== 'system'
    )
    nextMessages = [
      ...systemMessages,
      ...conversationMessages.slice(-options.rollingWindowMessages),
    ]
  }

  return nextMessages
}

function dropCompletedToolCallMessages(
  messages: LanguageModelV3Prompt
): LanguageModelV3Prompt {
  const lastToolRelatedIndex = findLastIndex(messages, isToolRelatedMessage)

  if (lastToolRelatedIndex === -1) {
    return messages
  }

  let latestToolExchangeStartIndex = lastToolRelatedIndex
  while (
    latestToolExchangeStartIndex > 0 &&
    isToolRelatedMessage(messages[latestToolExchangeStartIndex - 1])
  ) {
    latestToolExchangeStartIndex -= 1
  }

  return messages.filter((message, index) => {
    if (index >= latestToolExchangeStartIndex) {
      return true
    }

    return !isToolRelatedMessage(message)
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

function isToolRelatedMessage(message: LanguageModelV3Message) {
  if (message.role === 'tool') {
    return true
  }

  if (message.role !== 'assistant') {
    return false
  }

  if (!Array.isArray(message.content)) {
    return false
  }

  return message.content.some(
    (part) => part.type === 'tool-call' || part.type === 'tool-result'
  )
}

export async function applyHistoryManagement(
  prompt: LanguageModelV3Prompt,
  options: HistoryManagementOptions | undefined
): Promise<LanguageModelV3Prompt> {
  if (!options) {
    return prompt
  }

  let nextPrompt = prompt

  if (options.dropCompletedToolCalls) {
    nextPrompt = trimMessagesForHistory(nextPrompt, {
      dropCompletedToolCalls: true,
    })
  }

  if (options.rollingWindowMessages && options.rollingWindowMessages > 0) {
    nextPrompt = trimMessagesForHistory(nextPrompt, {
      rollingWindowMessages: options.rollingWindowMessages,
    })
  }

  if (options.summarizeHistory) {
    nextPrompt = await summarizePromptHistory(
      nextPrompt,
      options.summarizeHistory.threshold,
      options.summarizeHistory.model
    )
  }

  return nextPrompt
}

export function wrapLanguageModelWithHistory<TModel extends LanguageModelV3>(
  model: TModel,
  options: HistoryManagementOptions
): TModel {
  return new Proxy(model, {
    get(target, prop, receiver) {
      if (prop === 'doGenerate') {
        return async (callOptions: LanguageModelV3CallOptions) => {
          const prompt = await applyHistoryManagement(
            callOptions.prompt,
            options
          )
          return target.doGenerate.call(target, {
            ...callOptions,
            prompt,
          })
        }
      }

      if (prop === 'doStream') {
        return async (callOptions: LanguageModelV3CallOptions) => {
          const prompt = await applyHistoryManagement(
            callOptions.prompt,
            options
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
