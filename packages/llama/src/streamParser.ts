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

type Placeholder = (typeof PLACEHOLDERS)[number]

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

function getLongestPlaceholderPrefixSuffix(
  value: string,
  placeholders: readonly Placeholder[] = PLACEHOLDERS
): string {
  for (
    let length = Math.min(value.length, MAX_PLACEHOLDER_LENGTH);
    length > 0;
    length -= 1
  ) {
    const suffix = value.slice(-length)
    if (placeholders.some((placeholder) => placeholder.startsWith(suffix))) {
      return suffix
    }
  }

  return ''
}

function getFirstPlaceholderMatch(
  value: string,
  placeholders: readonly Placeholder[] = PLACEHOLDERS
) {
  const matches = placeholders
    .map((placeholder) => ({
      placeholder,
      index: value.indexOf(placeholder),
    }))
    .filter(({ index }) => index !== -1)

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
  let lastNativeContent = ''
  let lastNativeReasoning = ''

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

  const openReasoningBlock = () => {
    finishCurrentBlock()
    state = 'reasoning'
    currentChunkId = generateId()
    sink.enqueue({
      type: 'reasoning-start',
      id: currentChunkId,
    })
  }

  const openTextBlock = () => {
    finishCurrentBlock()
    state = 'text'
    currentChunkId = generateId()
    sink.enqueue({
      type: 'text-start',
      id: currentChunkId,
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

  const emitNativeDelta = (type: 'text' | 'reasoning', value: string) => {
    const previousValue =
      type === 'text' ? lastNativeContent : lastNativeReasoning

    if (
      value.length < previousValue.length ||
      !value.startsWith(previousValue)
    ) {
      if (type === 'text') {
        openTextBlock()
      } else {
        openReasoningBlock()
      }

      const resetDelta = value
      if (type === 'text') {
        lastNativeContent = value
      } else {
        lastNativeReasoning = value
      }
      emitDelta(resetDelta)
      return
    }

    const delta = value.slice(previousValue.length)
    if (!delta) {
      if (type === 'text') {
        lastNativeContent = value
      } else {
        lastNativeReasoning = value
      }
      return
    }

    if (type === 'text' && state !== 'text') {
      openTextBlock()
    }

    if (type === 'reasoning' && state !== 'reasoning') {
      openReasoningBlock()
    }

    if (type === 'text') {
      lastNativeContent = value
    } else {
      lastNativeReasoning = value
    }

    emitDelta(delta)
  }

  const processNativeParsedContent = (tokenData: TokenData) => {
    const reasoningValue = tokenData.reasoning_content ?? ''
    const contentValue = tokenData.content ?? ''

    if (!reasoningValue && lastNativeReasoning) {
      lastNativeReasoning = ''
      if (state === 'reasoning') {
        finishCurrentBlock()
      }
    }

    if (reasoningValue) {
      emitNativeDelta('reasoning', reasoningValue)
    }

    if (!contentValue && lastNativeContent) {
      lastNativeContent = ''
      if (state === 'text') {
        finishCurrentBlock()
      }
    }

    if (contentValue) {
      emitNativeDelta('text', contentValue)
    }
  }

  const handlePlaceholder = (placeholder: Placeholder) => {
    if (placeholder === START_OF_THINKING_PLACEHOLDER) {
      openReasoningBlock()
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
      const activePlaceholders: readonly Placeholder[] =
        state === 'tool-call' ? [END_OF_TOOL_CALL_PLACEHOLDER] : PLACEHOLDERS
      const placeholderMatch = getFirstPlaceholderMatch(
        pendingText,
        activePlaceholders
      )

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

      const pendingPrefix = getLongestPlaceholderPrefixSuffix(
        pendingText,
        activePlaceholders
      )
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

    const hasNativeParsedContent =
      tokenData.content !== undefined ||
      tokenData.reasoning_content !== undefined

    if (hasNativeParsedContent) {
      if (
        pendingToolCalls.length > 0 &&
        tokenData.token.includes(END_OF_TOOL_CALL_PLACEHOLDER)
      ) {
        finishCurrentBlock()
        emitPendingToolCalls()
      }
      processNativeParsedContent(tokenData)
      return
    }

    pendingText += tokenData.token
    flushBuffer(false)
  }

  return {
    processToken,
    finish: () => {
      flushBuffer(true)
      if (pendingToolCalls.length > 0) {
        finishCurrentBlock()
        emitPendingToolCalls()
      }
      finishCurrentBlock()
    },
  }
}
