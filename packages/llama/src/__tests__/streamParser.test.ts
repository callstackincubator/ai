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
  test('handles split <think> delimiters as reasoning boundaries', () => {
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

    expect(
      parts.filter((part) => part.type === 'reasoning-start')
    ).toHaveLength(1)

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

  test('treats thinking markers inside tool-call payload as opaque text', () => {
    const parts = runParser([
      { token: '<tool_call>' },
      {
        token: '{"query":"what does <think>reasoning</think> mean?"}',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"what does <think>reasoning</think> mean?"}',
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
      input: '{"query":"what does <think>reasoning</think> mean?"}',
    })
  })

  test('treats split thinking markers inside tool-call payload as opaque text', () => {
    const parts = runParser([
      { token: '<tool_call>' },
      { token: '{"query":"what does <thi' },
      { token: 'nk>reasoning</thi' },
      {
        token: 'nk> mean?"}',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"what does <think>reasoning</think> mean?"}',
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
      input: '{"query":"what does <think>reasoning</think> mean?"}',
    })
  })
})
