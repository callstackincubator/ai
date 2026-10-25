import type { LanguageModelV4FunctionTool } from '@ai-sdk/provider'
import { createAppleProvider } from '@react-native-ai/apple'
import { generateText, tool } from 'ai'
import { describe, expect, it } from 'react-native-harness'
import { z } from 'zod'

import { createTools, prompt, readAll } from './helpers'

const requiredWarning = {
  type: 'unsupported',
  feature: 'toolChoice',
  details:
    'Apple Foundation Models run tools natively and cannot be required to call a tool.',
}

const timeTool: LanguageModelV4FunctionTool = {
  type: 'function',
  name: 'getCurrentTime',
  description: 'Get the current time.',
  inputSchema: { type: 'object', properties: {} },
}

describe('apple tools', () => {
  it('runs a registered tool with the arguments the model chose', async () => {
    const { calls, provider, tools } = createTools()

    const result = await generateText({
      model: provider(),
      tools,
      prompt: 'What is the weather in Paris? Use your tool.',
    })

    expect(calls).toEqual([
      { name: 'getWeather', input: { city: expect.stringMatching(/paris/i) } },
    ])
    expect(result.text).toMatch(/sunny|24/i)
  })

  it('reports provider-executed tool calls and results', async () => {
    const { provider, tools } = createTools()

    const result = await generateText({
      model: provider(),
      tools,
      prompt: 'What time is it right now? Use your tool.',
    })

    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-call',
          toolName: 'getCurrentTime',
          providerExecuted: true,
        }),
        expect.objectContaining({
          type: 'tool-result',
          toolName: 'getCurrentTime',
          output: '10:42',
        }),
      ])
    )
  })

  it('streams tool calls and results before the answer', async () => {
    const { provider } = createTools()

    const { stream } = await provider().doStream({
      prompt: prompt('What time is it right now? Use your tool.'),
      tools: [timeTool],
    })
    const types = (await readAll(stream)).map((part) => part.type)

    expect(types.indexOf('tool-call')).toBeGreaterThan(-1)
    expect(types.indexOf('tool-result')).toBeGreaterThan(
      types.indexOf('tool-call')
    )
    expect(types.indexOf('text-delta')).toBeGreaterThan(
      types.indexOf('tool-result')
    )
  })

  it('calls no tools for none tool choice', async () => {
    const { calls, provider, tools } = createTools()

    await generateText({
      model: provider(),
      tools,
      toolChoice: 'none',
      prompt: 'What time is it right now? Use your tool.',
    })

    expect(calls).toEqual([])
  })

  it('offers only the named tool and warns it cannot be required', async () => {
    const { calls, provider, tools } = createTools()

    const result = await generateText({
      model: provider(),
      tools,
      toolChoice: { type: 'tool', toolName: 'getCurrentTime' },
      prompt:
        'What is the weather in Paris, and what time is it? Use your tools.',
    })

    expect(calls.map((call) => call.name)).toEqual(['getCurrentTime'])
    expect(result.warnings).toEqual([requiredWarning])
  })

  it('warns that required tool choice is unsupported', async () => {
    const { provider } = createTools()

    const result = await provider().doGenerate({
      prompt: prompt('Say hi.'),
      tools: [timeTool],
      toolChoice: { type: 'required' },
    })
    const { stream } = await provider().doStream({
      prompt: prompt('Say hi.'),
      tools: [timeTool],
      toolChoice: { type: 'required' },
    })

    expect(result.warnings).toEqual([requiredWarning])
    expect((await readAll(stream))[0]).toEqual({
      type: 'stream-start',
      warnings: [requiredWarning],
    })
  })

  it('uses tools registered later with updateTools', async () => {
    const calls: string[] = []
    const model = createAppleProvider()()
    const getCurrentTime = tool({
      description: 'Get the current time.',
      inputSchema: z.object({}),
      execute: async () => {
        calls.push('getCurrentTime')
        return '10:42'
      },
    })
    model.updateTools({ getCurrentTime })

    await generateText({
      model,
      tools: { getCurrentTime },
      prompt: 'What time is it right now? Use your tool.',
    })

    expect(calls).toEqual(['getCurrentTime'])
  })

  it('passes nested object arguments to a tool', async () => {
    const calls: unknown[] = []
    const getWeather = tool({
      description: 'Get the current weather at a location.',
      inputSchema: z.object({
        location: z.object({ city: z.string(), country: z.string() }),
      }),
      execute: async (input) => {
        calls.push(input)
        return 'sunny'
      },
    })

    await generateText({
      model: createAppleProvider({ availableTools: { getWeather } })(),
      tools: { getWeather },
      prompt: 'What is the weather in Paris, France? Use your tool.',
    })

    expect(calls).toEqual([
      {
        location: {
          city: expect.stringMatching(/paris/i),
          country: expect.stringMatching(/france/i),
        },
      },
    ])
  })

  it('reports an error thrown by a tool as a tool call error', async () => {
    const getCurrentTime = tool({
      description: 'Get the current time.',
      inputSchema: z.object({}),
      execute: async (): Promise<string> => {
        throw new Error('The clock is broken')
      },
    })
    const model = createAppleProvider({ availableTools: { getCurrentTime } })()

    await expect(
      model.doGenerate({
        prompt: prompt('What time is it right now? Use your tool.'),
        tools: [timeTool],
      })
    ).rejects.toMatchObject({
      code: 'TOOL_CALL_ERROR',
      message: expect.stringContaining('The clock is broken'),
    })
  })

  it('explains how to register a tool the provider does not know', async () => {
    const model = createAppleProvider()()

    await expect(
      model.doGenerate({
        prompt: prompt('What time is it right now? Use your tool.'),
        tools: [timeTool],
      })
    ).rejects.toThrow(
      'Tool "getCurrentTime" is not registered with the Apple provider'
    )
  })
})

describe('apple tool history', () => {
  it('replays earlier tool calls and their results', async () => {
    const { provider } = createTools()

    const result = await provider().doGenerate({
      tools: [timeTool],
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'What time is it?' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'getCurrentTime',
              input: {},
            },
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'getCurrentTime',
              output: { type: 'text', value: '07:15' },
            },
            { type: 'text', text: 'It is 07:15.' },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What time did the tool return earlier? Do not call it again.',
            },
          ],
        },
      ],
    })

    expect(result.content.at(-1)).toMatchObject({
      text: expect.stringContaining('7:15'),
    })
  })

  it('replays denied tool calls and skips tool approval responses', async () => {
    const { provider } = createTools()

    const result = await provider().doGenerate({
      tools: [timeTool],
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'What time is it?' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'getCurrentTime',
              input: {},
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: 'approval-1',
              approved: false,
            },
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'getCurrentTime',
              output: { type: 'execution-denied', reason: 'Not allowed' },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Never mind. Just say OK.' }],
        },
      ],
    })

    expect(result.content.at(-1)).toMatchObject({ type: 'text' })
  })
})
