import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { generateId } from '@ai-sdk/provider-utils'
import type { TokenData } from 'llama.rn'

export type LLMState = 'text' | 'reasoning' | 'tool-call' | 'none'

export const START_OF_THINKING_PLACEHOLDER = '<think>'
export const END_OF_THINKING_PLACEHOLDER = '</think>'

export const START_OF_TOOL_CALL_PLACEHOLDER = '<tool_call>'
export const END_OF_TOOL_CALL_PLACEHOLDER = '</tool_call>'

const PLACEHOLDERS = [
  START_OF_THINKING_PLACEHOLDER,
  END_OF_THINKING_PLACEHOLDER,
  START_OF_TOOL_CALL_PLACEHOLDER,
  END_OF_TOOL_CALL_PLACEHOLDER,
] as const

const MAX_PLACEHOLDER_LENGTH = Math.max(
  ...PLACEHOLDERS.map((value) => value.length)
)

export interface StreamPartSink {
  enqueue: (part: LanguageModelV3StreamPart) => void
}

export interface LlamaStreamParser {
  processToken: (tokenData: TokenData) => void
  finish: () => void
}

function getLongestPlaceholderPrefixSuffix(value: string): string {
  for (
    let length = Math.min(value.length, MAX_PLACEHOLDER_LENGTH);
    length > 0;
    length -= 1
  ) {
    const suffix = value.slice(-length)
    if (PLACEHOLDERS.some((placeholder) => placeholder.startsWith(suffix))) {
      return suffix
    }
  }

  return ''
}

function getFirstPlaceholderMatch(value: string) {
  const matches = PLACEHOLDERS.map((placeholder) => ({
    placeholder,
    index: value.indexOf(placeholder),
  })).filter(({ index }) => index !== -1)

  if (matches.length === 0) {
    return null
  }

  return matches.reduce((earliest, current) => {
    if (current.index < earliest.index) {
      return current
    }

    return earliest
  })
}

export function createLlamaStreamParser(
  sink: StreamPartSink
): LlamaStreamParser {
  let currentChunkId = generateId()
  let state: LLMState = 'none'
  let pendingText = ''
  let pendingToolCallIds = new Set<string>()
  let pendingToolCalls: NonNullable<TokenData['tool_calls']> = []

  const finishCurrentBlock = () => {
    if (state === 'text') {
      sink.enqueue({
        type: 'text-end',
        id: currentChunkId,
      })
    }
    if (state === 'reasoning') {
      sink.enqueue({
        type: 'reasoning-end',
        id: currentChunkId,
      })
    }
    state = 'none'
  }

  const emitDelta = (delta: string) => {
    if (!delta) {
      return
    }

    if (state === 'tool-call') {
      return
    }

    if (state === 'none') {
      state = 'text'
      currentChunkId = generateId()
      sink.enqueue({
        type: 'text-start',
        id: currentChunkId,
      })
    }

    if (state === 'text') {
      sink.enqueue({
        type: 'text-delta',
        id: currentChunkId,
        delta,
      })
      return
    }

    sink.enqueue({
      type: 'reasoning-delta',
      id: currentChunkId,
      delta,
    })
  }

  const queueToolCalls = (toolCalls: TokenData['tool_calls']) => {
    for (const toolCall of toolCalls ?? []) {
      if (!toolCall.id) {
        pendingToolCalls.push(toolCall)
        continue
      }

      if (pendingToolCallIds.has(toolCall.id)) {
        continue
      }

      pendingToolCallIds.add(toolCall.id)
      pendingToolCalls.push(toolCall)
    }
  }

  const emitPendingToolCalls = () => {
    for (const toolCall of pendingToolCalls) {
      sink.enqueue({
        type: 'tool-call',
        toolCallId: toolCall.id ?? generateId(),
        toolName: toolCall.function.name,
        input: toolCall.function.arguments,
      })
    }
    pendingToolCallIds.clear()
    pendingToolCalls = []
  }

  const handlePlaceholder = (placeholder: (typeof PLACEHOLDERS)[number]) => {
    if (placeholder === START_OF_THINKING_PLACEHOLDER) {
      finishCurrentBlock()
      state = 'reasoning'
      currentChunkId = generateId()
      sink.enqueue({
        type: 'reasoning-start',
        id: currentChunkId,
      })
      return
    }

    if (placeholder === END_OF_THINKING_PLACEHOLDER) {
      finishCurrentBlock()
      return
    }

    if (placeholder === START_OF_TOOL_CALL_PLACEHOLDER) {
      finishCurrentBlock()
      state = 'tool-call'
      return
    }

    finishCurrentBlock()
    emitPendingToolCalls()
  }

  const flushBuffer = (force = false) => {
    while (pendingText.length > 0) {
      const placeholderMatch = getFirstPlaceholderMatch(pendingText)

      if (placeholderMatch) {
        const { placeholder, index } = placeholderMatch
        const prefix = pendingText.slice(0, index)
        if (prefix) {
          emitDelta(prefix)
        }
        pendingText = pendingText.slice(index + placeholder.length)
        handlePlaceholder(placeholder)
        continue
      }

      const pendingPrefix = getLongestPlaceholderPrefixSuffix(pendingText)
      const flushableLength = pendingText.length - pendingPrefix.length

      if (!force && flushableLength <= 0) {
        return
      }

      const flushUntil = force ? pendingText.length : flushableLength
      const flushableText = pendingText.slice(0, flushUntil)
      pendingText = pendingText.slice(flushUntil)
      emitDelta(flushableText)
    }
  }

  const processToken = (tokenData: TokenData) => {
    if (tokenData.tool_calls?.length) {
      queueToolCalls(tokenData.tool_calls)
    }

    pendingText += tokenData.token
    flushBuffer(false)
  }

  return {
    processToken,
    finish: () => {
      flushBuffer(true)
      if (state === 'tool-call') {
        finishCurrentBlock()
        emitPendingToolCalls()
        return
      }
      finishCurrentBlock()
    },
  }
}
