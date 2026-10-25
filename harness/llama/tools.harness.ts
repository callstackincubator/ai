import { generateText, streamText } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { createTools, setupLanguageModel } from './helpers'

const model = setupLanguageModel()

describe('llama tools', () => {
  it('calls a tool with its arguments', async () => {
    const { calls, tools } = createTools()

    const result = await generateText({
      model: model(),
      tools,
      reasoning: 'none',
      prompt: 'What is the weather in Paris? Use your tool.',
    })

    expect(calls).toEqual([
      { name: 'getWeather', input: expect.objectContaining({ city: 'Paris' }) },
    ])
    expect(result.finishReason).toBe('tool-calls')
  })

  it('streams each tool call once', async () => {
    const { calls, tools } = createTools()

    const result = streamText({
      model: model(),
      tools,
      reasoning: 'none',
      prompt: 'What time is it right now? Use your tool.',
    })

    const toolCallIds: string[] = []
    for await (const part of result.fullStream) {
      if (part.type === 'tool-call') {
        toolCallIds.push(part.toolCallId)
      }
    }

    expect(toolCallIds).toHaveLength(1)
    expect(calls).toHaveLength(1)
  })

  it('calls no tools for none tool choice', async () => {
    const { calls, tools } = createTools()

    await generateText({
      model: model(),
      tools,
      toolChoice: 'none',
      reasoning: 'none',
      prompt: 'What time is it right now? Use your tool.',
    })

    expect(calls).toEqual([])
  })

  it('calls only the named tool', async () => {
    const { calls, tools } = createTools()

    await generateText({
      model: model(),
      tools,
      toolChoice: { type: 'tool', toolName: 'getCurrentTime' },
      reasoning: 'none',
      prompt: 'What is the weather in Paris?',
    })

    expect(calls.map((call) => call.name)).toEqual(['getCurrentTime'])
  })
})
