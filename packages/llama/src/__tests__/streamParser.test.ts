import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { describe, expect, test } from 'bun:test'
import type { TokenData } from 'llama.rn'

import { createLlamaStreamParser } from '../streamParser'

function runParser(tokens: TokenData[]): LanguageModelV3StreamPart[] {
  const parts: LanguageModelV3StreamPart[] = []
  const parser = createLlamaStreamParser({
    enqueue: (part) => parts.push(part),
  })

  for (const token of tokens) {
    parser.processToken(token)
  }

  parser.finish()

  return parts
}

describe('createLlamaStreamParser', () => {
  test('prefers native reasoning/content fields and emits deltas from accumulated values', () => {
    const parts = runParser([
      { token: '', reasoning_content: 'Let me' },
      { token: '', reasoning_content: 'Let me think' },
      { token: '', content: 'Final' },
      { token: '', content: 'Final answer' },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'reasoning-start',
      'reasoning-delta',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
    ])

    const reasoningDeltas = parts.filter(
      (
        part
      ): part is Extract<
        LanguageModelV3StreamPart,
        { type: 'reasoning-delta' }
      > => part.type === 'reasoning-delta'
    )
    const textDeltas = parts.filter(
      (
        part
      ): part is Extract<LanguageModelV3StreamPart, { type: 'text-delta' }> =>
        part.type === 'text-delta'
    )

    expect(reasoningDeltas.map((part) => part.delta)).toEqual([
      'Let me',
      ' think',
    ])
    expect(textDeltas.map((part) => part.delta)).toEqual(['Final', ' answer'])
  })

  test('does not duplicate output when native fields and raw tokens coexist on the same chunk', () => {
    const parts = runParser([
      { token: 'Let me', reasoning_content: 'Let me' },
      { token: ' think', reasoning_content: 'Let me think' },
      { token: 'Final', content: 'Final' },
      { token: ' answer', content: 'Final answer' },
    ])

    const reasoningDeltas = parts.filter(
      (
        part
      ): part is Extract<
        LanguageModelV3StreamPart,
        { type: 'reasoning-delta' }
      > => part.type === 'reasoning-delta'
    )
    const textDeltas = parts.filter(
      (
        part
      ): part is Extract<LanguageModelV3StreamPart, { type: 'text-delta' }> =>
        part.type === 'text-delta'
    )

    expect(reasoningDeltas.map((part) => part.delta)).toEqual([
      'Let me',
      ' think',
    ])
    expect(textDeltas.map((part) => part.delta)).toEqual(['Final', ' answer'])
  })

  test('flushes buffered fallback text even after native chunks appeared', () => {
    const parts = runParser([
      { token: '', content: 'Final' },
      { token: '<' },
      { token: 'think' },
      { token: '>' },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'text-start',
      'text-delta',
      'text-end',
      'reasoning-start',
      'reasoning-end',
    ])
  })

  test('falls back to placeholder parsing when native fields are absent', () => {
    const parts = runParser([
      { token: '<' },
      { token: 'think' },
      { token: '>' },
      { token: 'reasoning text' },
      { token: '</' },
      { token: 'think' },
      { token: '>' },
      { token: 'final answer' },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-end',
    ])
  })

  test('handles markers embedded in a reasoning chunk', () => {
    const parts = runParser([
      { token: '<think>' },
      { token: 'reasoning text</think>' },
      { token: 'final answer' },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-end',
    ])

    expect(
      parts
        .filter(
          (
            part
          ): part is Extract<
            LanguageModelV3StreamPart,
            { type: 'reasoning-delta' }
          > => part.type === 'reasoning-delta'
        )
        .map((part) => part.delta)
        .join('')
    ).toBe('reasoning text')

    expect(
      parts
        .filter(
          (
            part
          ): part is Extract<
            LanguageModelV3StreamPart,
            { type: 'text-delta' }
          > => part.type === 'text-delta'
        )
        .map((part) => part.delta)
        .join('')
    ).toBe('final answer')
  })

  test('keeps <think> markers inside tool-call payload text untouched', () => {
    const parts = runParser([
      { token: '<tool_call>' },
      {
        token: '{"prompt":"<think>do not parse</think>"}',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"prompt":"<think>do not parse</think>"}',
            },
          },
        ],
      },
      { token: '</tool_call>' },
    ])

    expect(parts.map((part) => part.type)).toEqual(['tool-call'])
    expect(parts[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-1',
      toolName: 'search',
      input: '{"prompt":"<think>do not parse</think>"}',
    })
  })

  test('keeps split <think> markers inside tool-call payload text untouched', () => {
    const parts = runParser([
      { token: '<tool_call>' },
      {
        token: '{"prompt":"<thi',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"prompt":"<think>do not parse</think>"}',
            },
          },
        ],
      },
      { token: 'nk>do not parse</think>"}' },
      { token: '</tool_call>' },
    ])

    expect(parts.map((part) => part.type)).toEqual(['tool-call'])
    expect(parts[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-1',
      toolName: 'search',
      input: '{"prompt":"<think>do not parse</think>"}',
    })
  })

  test('handles start and end markers inside a single chunk', () => {
    const parts = runParser([
      { token: '<think>reasoning text</think>final answer' },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-end',
    ])

    expect(
      parts
        .filter(
          (
            part
          ): part is Extract<
            LanguageModelV3StreamPart,
            { type: 'reasoning-delta' }
          > => part.type === 'reasoning-delta'
        )
        .map((part) => part.delta)
        .join('')
    ).toBe('reasoning text')

    expect(
      parts
        .filter(
          (
            part
          ): part is Extract<
            LanguageModelV3StreamPart,
            { type: 'text-delta' }
          > => part.type === 'text-delta'
        )
        .map((part) => part.delta)
        .join('')
    ).toBe('final answer')
  })

  test('keeps baseline behavior when <think> arrives as full tokens', () => {
    const parts = runParser([
      { token: '<think>' },
      { token: 'reasoning text' },
      { token: '</think>' },
      { token: 'final answer' },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-end',
    ])

    expect(
      parts.filter((part) => part.type === 'reasoning-start')
    ).toHaveLength(1)
  })

  test('does not leak partial placeholder prefixes into text output', () => {
    const parts = runParser([
      { token: '<' },
      { token: 'thi' },
      { token: 'nk>' },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'reasoning-start',
      'reasoning-end',
    ])
  })

  test('does not duplicate accumulated tool calls with ids', () => {
    const parts = runParser([
      { token: '<tool_call>' },
      {
        token: '{',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"react native"}',
            },
          },
        ],
      },
      {
        token: '}',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"react native"}',
            },
          },
        ],
      },
      { token: '</tool_call>' },
    ])

    const toolCalls = parts.filter((part) => part.type === 'tool-call')

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-1',
      toolName: 'search',
      input: '{"query":"react native"}',
    })
  })

  test('preserves distinct no-id tool calls with identical payloads', () => {
    const parts = runParser([
      { token: '<tool_call>' },
      {
        token: '{',
        tool_calls: [
          {
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"react native"}',
            },
          },
          {
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"react native"}',
            },
          },
        ],
      },
      { token: '</tool_call>' },
    ])

    const toolCalls = parts.filter((part) => part.type === 'tool-call')

    expect(toolCalls).toHaveLength(2)
  })

  test('emits tool calls queued on native chunks even without tool-call state', () => {
    const parts = runParser([
      {
        token: '<tool_call>{"query":"react native"}</tool_call>',
        content: 'Final answer',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"react native"}',
            },
          },
        ],
      },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'tool-call',
      'text-start',
      'text-delta',
      'text-end',
    ])
  })

  test('emits native tool calls at the closing marker boundary before resumed text', () => {
    const parts = runParser([
      {
        token: '</tool_call>final answer',
        content: 'final answer',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"react native"}',
            },
          },
        ],
      },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'tool-call',
      'text-start',
      'text-delta',
      'text-end',
    ])
  })

  test('emits tool calls at the closing marker boundary before resumed text', () => {
    const parts = runParser([
      { token: '<tool_call>' },
      {
        token: '{"query":"react native"}',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"react native"}',
            },
          },
        ],
      },
      { token: '</tool_call>final answer' },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'tool-call',
      'text-start',
      'text-delta',
      'text-end',
    ])
  })

  test('handles split opening <tool_call> delimiters without leaking marker text', () => {
    const parts = runParser([
      { token: '<tool' },
      { token: '_call>' },
      {
        token: '{"query":"react native"}',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"react native"}',
            },
          },
        ],
      },
      { token: '</tool_call>' },
    ])

    expect(parts.map((part) => part.type)).toEqual(['tool-call'])

    const toolCalls = parts.filter((part) => part.type === 'tool-call')

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-1',
      toolName: 'search',
      input: '{"query":"react native"}',
    })
  })

  test('handles split closing </tool_call> delimiters before resuming text', () => {
    const parts = runParser([
      { token: '<tool_call>' },
      {
        token: '{"query":"react native"}',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"react native"}',
            },
          },
        ],
      },
      { token: '</tool' },
      { token: '_call>final answer' },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'tool-call',
      'text-start',
      'text-delta',
      'text-end',
    ])

    const toolCalls = parts.filter((part) => part.type === 'tool-call')
    const textDeltas = parts.filter((part) => part.type === 'text-delta')

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-1',
      toolName: 'search',
      input: '{"query":"react native"}',
    })
    expect(textDeltas).toHaveLength(1)
    expect(textDeltas[0]).toMatchObject({
      type: 'text-delta',
      delta: 'final answer',
    })
  })
})
