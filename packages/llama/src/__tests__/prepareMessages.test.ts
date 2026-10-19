import type { LanguageModelV3Prompt } from '@ai-sdk/provider'
import { describe, expect, test } from 'bun:test'

import { prepareMessagesWithMedia } from '../completionOptions'

function run(prompt: LanguageModelV3Prompt) {
  return prepareMessagesWithMedia(prompt)
}

describe('prepareMessagesWithMedia', () => {
  test('passes string content through', () => {
    expect(
      run([
        { role: 'system', content: 'be nice' },
        { role: 'user', content: 'hi' },
      ])
    ).toEqual([
      { role: 'system', content: 'be nice' },
      { role: 'user', content: 'hi' },
    ])
  })

  test('flattens text parts into separate messages', () => {
    expect(
      run([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'first' },
            { type: 'text', text: 'second' },
          ],
        },
      ])
    ).toEqual([
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second' },
    ])
  })

  test('encodes Uint8Array image data as a data URL', () => {
    expect(
      run([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: new Uint8Array([65, 66, 67]),
            },
          ],
        },
      ])
    ).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,QUJD' },
          },
        ],
      },
    ])
  })

  test('keeps string and URL image data as-is', () => {
    const messages = run([
      {
        role: 'user',
        content: [
          { type: 'file', mediaType: 'image/jpeg', data: 'base64blob' },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: new URL('file:///tmp/a.png'),
          },
        ],
      },
    ])

    expect(messages[0].content).toEqual([
      { type: 'image_url', image_url: { url: 'base64blob' } },
    ])
    expect(messages[1].content).toEqual([
      { type: 'image_url', image_url: { url: 'file:///tmp/a.png' } },
    ])
  })

  test('maps audio data URLs and file URLs with format detection', () => {
    const messages = run([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'audio/wav',
            data: 'data:audio/wav;base64,QUJD',
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'file', mediaType: 'audio/mpeg', data: 'file:///tmp/a.mp3' },
        ],
      },
    ])

    expect(messages[0].content).toEqual([
      {
        type: 'input_audio',
        input_audio: { format: 'wav', data: 'data:audio/wav;base64,QUJD' },
      },
    ])
    expect(messages[1].content).toEqual([
      {
        type: 'input_audio',
        input_audio: { format: 'mp3', url: 'file:///tmp/a.mp3' },
      },
    ])
  })

  test('unsupported media types become empty text parts', () => {
    expect(
      run([
        {
          role: 'user',
          content: [{ type: 'file', mediaType: 'application/pdf', data: 'x' }],
        },
      ])
    ).toEqual([{ role: 'user', content: [{ type: 'text', text: '' }] }])
  })

  test('rejects unsupported user content types', () => {
    expect(() =>
      run([
        {
          role: 'user',
          content: [{ type: 'reasoning', text: 'nope' }],
        },
      ] as LanguageModelV3Prompt)
    ).toThrow('Unsupported message content type')
  })

  test('converts assistant reasoning, text and tool calls', () => {
    expect(
      run([
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'thinking hard' },
            { type: 'text', text: 'the answer' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: { q: 'cats' },
            },
          ],
        },
      ])
    ).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'the answer' }],
        reasoning_content: 'thinking hard',
        tool_calls: [
          {
            type: 'function',
            id: 'call-1',
            function: { name: 'lookup', arguments: '{"q":"cats"}' },
          },
        ],
      },
    ])
  })

  test('skips assistant tool results with a warning', () => {
    const warnings: unknown[][] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => warnings.push(args)

    try {
      const messages = run([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'lookup',
              output: { type: 'text', value: 'unused' },
            },
          ],
        },
      ])

      expect(messages).toHaveLength(1)
      expect(messages[0].content).toEqual([])
      expect(warnings).toHaveLength(1)
    } finally {
      console.warn = originalWarn
    }
  })

  test('emits one tool message per tool result', () => {
    expect(
      run([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'lookup',
              output: { type: 'json', value: { ok: true } },
            },
            {
              type: 'tool-result',
              toolCallId: 'call-2',
              toolName: 'lookup',
              output: { type: 'execution-denied', reason: 'denied by user' },
            },
            {
              type: 'tool-result',
              toolCallId: 'call-3',
              toolName: 'lookup',
              output: { type: 'execution-denied' },
            },
          ],
        },
      ])
    ).toEqual([
      { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true}' },
      { role: 'tool', tool_call_id: 'call-2', content: 'denied by user' },
      { role: 'tool', tool_call_id: 'call-3', content: 'Execution denied' },
    ])
  })
})
