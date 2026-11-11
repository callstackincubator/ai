import { describe, expect, it } from 'bun:test'

import type { OutputChunk } from '../backend'
import {
  DEFAULT_CHANNELS,
  OutputParser,
  toolCallFromBody,
} from '../outputParser'

function parse(tokens: string[], channels = DEFAULT_CHANNELS): OutputChunk[] {
  const chunks: OutputChunk[] = []
  const parser = new OutputParser(channels, (chunk) => chunks.push(chunk))
  for (const token of tokens) parser.push(token)
  parser.finish()
  return chunks
}

const textOf = (chunks: OutputChunk[]) =>
  chunks.map((chunk) => (chunk.type === 'text' ? chunk.text : '')).join('')

describe('OutputParser', () => {
  it('passes plain text through', () => {
    expect(textOf(parse(['Hello', ' world']))).toBe('Hello world')
  })

  it('finds a tool call split across tokens', () => {
    const chunks = parse([
      'Sure. <to',
      'ol_call>{"name":"a",',
      '"arguments":{"x":1}}</tool',
      '_call> Done.',
    ])
    expect(textOf(chunks)).toBe('Sure.  Done.')
    expect(chunks.filter((chunk) => chunk.type === 'tool-call')).toEqual([
      { type: 'tool-call', name: 'a', argumentsJson: '{"x":1}' },
    ])
  })

  it('keeps two calls apart', () => {
    const calls = parse([
      '<tool_call>{"name":"a","arguments":{}}</tool_call><tool_call>{"name":"b","arguments":{}}</tool_call>',
    ]).filter((chunk) => chunk.type === 'tool-call')
    expect(calls.map((call) => (call as { name: string }).name)).toEqual([
      'a',
      'b',
    ])
  })

  it('reads the think tags an older bundle leaves in the text', () => {
    expect(parse(['<thi', 'nk>\n\nHmm', '</think>\n\nParis'])).toEqual([
      { type: 'reasoning', text: 'Hmm' },
      { type: 'text', text: 'Paris' },
    ])
  })

  it('drops an empty think block', () => {
    expect(parse(['<think>\n\n</think>\n\n', 'Paris'])).toEqual([
      { type: 'text', text: 'Paris' },
    ])
  })

  it('keeps the spaces inside an answer', () => {
    expect(parse(['<think>a</think>Par', ' is', ' big'])).toEqual([
      { type: 'reasoning', text: 'a' },
      { type: 'text', text: 'Par' },
      { type: 'text', text: ' is' },
      { type: 'text', text: ' big' },
    ])
  })

  it('separates reasoning from the answer', () => {
    const chunks = parse(['<thinking>Let me', ' see</thinking>Paris'])
    expect(chunks).toEqual([
      { type: 'reasoning', text: 'Let me' },
      { type: 'reasoning', text: ' see' },
      { type: 'text', text: 'Paris' },
    ])
  })

  it('does not hold back text that only looks like a marker at the end', () => {
    expect(textOf(parse(['a < b', ' and <', '']))).toBe('a < b and <')
  })

  it('turns an unterminated call into a call the SDK can report', () => {
    const chunks = parse(['<tool_call>{"name":"a","arguments":{"x":'])
    expect(chunks).toEqual([
      {
        type: 'tool-call',
        name: 'a',
        argumentsJson: '{"name":"a","arguments":{"x":',
      },
    ])
  })

  it('leaves markers alone when the channel is off', () => {
    const channels = DEFAULT_CHANNELS.filter(
      (channel) => channel.type !== 'tool-call'
    )
    expect(textOf(parse(['<tool_call>x</tool_call>'], channels))).toBe(
      '<tool_call>x</tool_call>'
    )
  })
})

describe('a reasoning tag', () => {
  const run = (...tokens: string[]) => {
    const chunks: OutputChunk[] = []
    const parser = new OutputParser(DEFAULT_CHANNELS, (chunk) =>
      chunks.push(chunk)
    )
    for (const token of tokens) parser.push(token)
    parser.finish()
    const of = (type: string) =>
      chunks
        .flatMap((c) => (c.type === type && 'text' in c ? [c.text] : []))
        .join('')
    return { text: of('text'), reasoning: of('reasoning') }
  }

  it('opens reasoning before any text', () => {
    expect(run('<think>Hm.</think>Paris')).toEqual({
      text: 'Paris',
      reasoning: 'Hm.',
    })
    expect(run('\n\n<think>Hm.</think>\n\nParis').reasoning).toBe('Hm.')
    expect(run('<thi', 'nk>Hm.</thi', 'nk>Paris')).toEqual({
      text: 'Paris',
      reasoning: 'Hm.',
    })
  })

  it('is only text after text: an answer can be about the tag', () => {
    const answer = 'Models wrap thoughts in a <think> tag and then answer.'
    expect(run(answer)).toEqual({ text: answer, reasoning: '' })
    expect(run('Models wrap thoughts in a <th', 'ink> tag.')).toEqual({
      text: 'Models wrap thoughts in a <think> tag.',
      reasoning: '',
    })
  })

  it('still opens after an earlier reasoning part', () => {
    expect(run('<think>a</think><think>b</think>Paris')).toEqual({
      text: 'Paris',
      reasoning: 'ab',
    })
  })
})

describe('toolCallFromBody', () => {
  it('reads a whole call', () => {
    expect(toolCallFromBody('{"name":"a","arguments":{"x":1}}')).toEqual({
      type: 'tool-call',
      name: 'a',
      argumentsJson: '{"x":1}',
    })
  })

  it('gives a call without arguments empty ones', () => {
    expect(toolCallFromBody('{"name":"a"}').argumentsJson).toBe('{}')
  })

  it('keeps the name of a call whose JSON is broken', () => {
    const call = toolCallFromBody('{"name":"a","arguments":{"x":')
    expect(call.name).toBe('a')
    expect(call.argumentsJson).toBe('{"name":"a","arguments":{"x":')
  })

  it('has no name for text that is not a call', () => {
    expect(toolCallFromBody('not json').name).toBe('')
  })
})
