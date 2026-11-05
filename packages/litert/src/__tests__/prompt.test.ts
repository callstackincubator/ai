import { UnsupportedFunctionalityError } from '@ai-sdk/provider'
import { describe, expect, it } from 'bun:test'

import {
  canonicalJson,
  selectTools,
  toConversation,
  transcriptKey,
} from '../prompt'

describe('toConversation', () => {
  it('splits system text, history and the final turn', () => {
    const conversation = toConversation([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'They greet me.' },
          { type: 'text', text: 'Hello.' },
        ],
      },
      { role: 'user', content: [{ type: 'text', text: 'Bye' }] },
    ])
    expect(conversation).toEqual({
      system: 'Be brief.',
      history: [
        { role: 'user', text: 'Hi' },
        { role: 'assistant', text: 'Hello.', toolCalls: [] },
      ],
      final: { role: 'user', text: 'Bye' },
    })
  })

  it('reads tool calls and every kind of tool result', () => {
    const conversation = toConversation([
      { role: 'user', content: [{ type: 'text', text: 'Weather?' }] },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: '1',
            toolName: 'w',
            input: { city: 'Tokyo' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: '1',
            toolName: 'w',
            output: { type: 'json', value: { c: 20 } },
          },
          {
            type: 'tool-result',
            toolCallId: '2',
            toolName: 'x',
            output: { type: 'text', value: 'ok' },
          },
          {
            type: 'tool-result',
            toolCallId: '3',
            toolName: 'y',
            output: { type: 'error-text', value: 'boom' },
          },
          {
            type: 'tool-result',
            toolCallId: '4',
            toolName: 'z',
            output: { type: 'execution-denied' },
          },
          {
            type: 'tool-result',
            toolCallId: '5',
            toolName: 'v',
            output: {
              type: 'content',
              value: [
                { type: 'text', text: 'a' },
                { type: 'text', text: 'b' },
              ],
            },
          },
        ],
      },
    ])
    expect(conversation.history[1]).toEqual({
      role: 'assistant',
      text: '',
      toolCalls: [{ name: 'w', arguments: { city: 'Tokyo' } }],
    })
    expect(conversation.final).toEqual({
      role: 'tool',
      results: [
        { name: 'w', value: { c: 20 } },
        { name: 'x', value: 'ok' },
        { name: 'y', value: { error: 'boom' } },
        { name: 'z', value: { error: 'The tool call was denied.' } },
        { name: 'v', value: 'ab' },
      ],
    })
  })

  it('refuses file parts', () => {
    expect(() =>
      toConversation([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: new Uint8Array(1) },
            },
          ],
        },
      ])
    ).toThrow(UnsupportedFunctionalityError)
  })

  it('refuses a prompt that ends with the assistant', () => {
    expect(() =>
      toConversation([
        { role: 'assistant', content: [{ type: 'text', text: 'Sure' }] },
      ])
    ).toThrow(UnsupportedFunctionalityError)
    expect(() => toConversation([])).toThrow(UnsupportedFunctionalityError)
  })
})

describe('selectTools', () => {
  const tools = [
    {
      type: 'function' as const,
      name: 'a',
      inputSchema: { type: 'object' as const },
    },
    {
      type: 'function' as const,
      name: 'b',
      inputSchema: { type: 'object' as const },
    },
  ]

  it('offers no tools for toolChoice none', () => {
    expect(selectTools({ tools, toolChoice: { type: 'none' } }, [])).toEqual([])
  })

  it('warns that it cannot force a call', () => {
    const warnings: any[] = []
    expect(
      selectTools({ tools, toolChoice: { type: 'required' } }, warnings)
    ).toHaveLength(2)
    expect(warnings[0].feature).toBe('toolChoice: required')
  })

  it('offers only the chosen tool', () => {
    const warnings: any[] = []
    const selected = selectTools(
      { tools, toolChoice: { type: 'tool', toolName: 'b' } },
      warnings
    )
    expect(selected.map((tool) => tool.name)).toEqual(['b'])
    expect(warnings).toHaveLength(1)
  })

  it('warns about provider tools', () => {
    const warnings: any[] = []
    const selected = selectTools(
      { tools: [{ type: 'provider', id: 'x.y', name: 'y', args: {} }] },
      warnings
    )
    expect(selected).toEqual([])
    expect(warnings[0].type).toBe('unsupported')
  })
})

describe('transcriptKey', () => {
  it('ignores key order and a trimmed reply', () => {
    const a = transcriptKey('s', [
      {
        role: 'assistant',
        text: ' Hello. ',
        toolCalls: [{ name: 't', arguments: { a: 1, b: 2 } }],
      },
    ])
    const b = transcriptKey('s', [
      {
        role: 'assistant',
        text: 'Hello.',
        toolCalls: [{ name: 't', arguments: { b: 2, a: 1 } }],
      },
    ])
    expect(a).toBe(b)
  })

  it('tells conversations apart', () => {
    const turn = { role: 'user' as const, text: 'a' }
    expect(transcriptKey('s', [turn])).not.toBe(transcriptKey('t', [turn]))
    expect(transcriptKey('s', [turn])).not.toBe(transcriptKey('s', []))
  })

  it('writes canonical JSON', () => {
    expect(canonicalJson({ b: [{ d: 1, c: 2 }], a: null })).toBe(
      '{"a":null,"b":[{"c":2,"d":1}]}'
    )
  })
})
