import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Message,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider'
import { describe, expect, mock, test } from 'bun:test'

import {
  applyHistoryManagement,
  trimMessagesForHistory,
  wrapLanguageModelWithHistory,
} from '../index'

function generationResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: 'stop' },
    usage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    },
    warnings: [],
  }
}

// A model whose countTokens reads instance state, like the llama.rn model
class TokenCountingModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'test'
  readonly modelId = 'test'
  readonly supportedUrls = {}

  private tokensPerCharacter = 1

  doGenerate = mock(async (options: LanguageModelV4CallOptions) =>
    generationResult(`summary ${this.doGenerate.mock.calls.length}`)
  )
  doStream = mock(async (_options: LanguageModelV4CallOptions) => {
    throw new Error('not used')
  })

  async countTokens(text: string) {
    return text.length * this.tokensPerCharacter
  }

  summarizedTexts() {
    return this.doGenerate.mock.calls.map(([options]) => {
      const part = options.prompt[1].content[0]
      return typeof part === 'object' && part.type === 'text' ? part.text : ''
    })
  }
}

const system = (content: string): LanguageModelV4Message => ({
  role: 'system',
  content,
})

const user = (text: string): LanguageModelV4Message => ({
  role: 'user',
  content: [{ type: 'text', text }],
})

const assistant = (text: string): LanguageModelV4Message => ({
  role: 'assistant',
  content: [{ type: 'text', text }],
})

const toolCall = (id: string, text?: string): LanguageModelV4Message => ({
  role: 'assistant',
  content: [
    ...(text ? [{ type: 'text' as const, text }] : []),
    { type: 'tool-call', toolCallId: id, toolName: 'weather', input: {} },
  ],
})

const toolResult = (id: string): LanguageModelV4Message => ({
  role: 'tool',
  content: [
    {
      type: 'tool-result',
      toolCallId: id,
      toolName: 'weather',
      output: { type: 'text', value: 'sunny' },
    },
  ],
})

const prompt: LanguageModelV4Prompt = [
  user('Tell me about Paris'),
  assistant('Paris is in France'),
  user('And Lyon?'),
]

describe('dropCompletedToolCalls', () => {
  test('strips tool calls of earlier turns and keeps their text', () => {
    const result = trimMessagesForHistory(
      [
        user('Weather?'),
        toolCall('1', 'Checking'),
        toolResult('1'),
        assistant('Sunny'),
        user('Tomorrow?'),
        toolCall('2'),
        toolResult('2'),
      ],
      { dropCompletedToolCalls: true }
    )

    expect(result).toEqual([
      user('Weather?'),
      assistant('Checking'),
      assistant('Sunny'),
      user('Tomorrow?'),
      toolCall('2'),
      toolResult('2'),
    ])
  })
})

describe('rollingWindowMessages', () => {
  test('keeps system messages and the last N messages', () => {
    const result = trimMessagesForHistory(
      [system('Be brief'), ...prompt, assistant('Lyon is in France')],
      { rollingWindowMessages: 2 }
    )

    expect(result).toEqual([
      system('Be brief'),
      user('And Lyon?'),
      assistant('Lyon is in France'),
    ])
  })

  test('does not start the window with an orphaned tool result', () => {
    const result = trimMessagesForHistory(
      [
        user('Weather?'),
        toolCall('1'),
        toolResult('1'),
        assistant('Sunny'),
        user('Thanks'),
      ],
      { rollingWindowMessages: 3 }
    )

    expect(result).toEqual([assistant('Sunny'), user('Thanks')])
  })

  test('keeps the whole current turn when it is longer than the window', () => {
    const result = trimMessagesForHistory(
      [
        user('Hi'),
        assistant('Hello'),
        user('Weather?'),
        toolCall('1'),
        toolResult('1'),
      ],
      { rollingWindowMessages: 1 }
    )

    expect(result).toEqual([user('Weather?'), toolCall('1'), toolResult('1')])
  })
})

describe('summarizeHistory', () => {
  test('counts tokens with the model as receiver', async () => {
    const model = new TokenCountingModel()

    // About 70 characters, so the length / 4 fallback (about 18) stays under
    // the threshold and only the model's own count goes over it
    const result = await applyHistoryManagement(prompt, {
      summarizeHistory: { threshold: 60, model },
    })

    expect(model.doGenerate).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(2)
  })

  test('leaves the prompt alone under the threshold', async () => {
    const model = new TokenCountingModel()

    const result = await applyHistoryManagement(prompt, {
      summarizeHistory: { threshold: 1000, model },
    })

    expect(model.doGenerate).not.toHaveBeenCalled()
    expect(result).toEqual(prompt)
  })

  test('adds the summary to the system message', async () => {
    const model = new TokenCountingModel()

    const result = await applyHistoryManagement(
      [system('Be brief'), ...prompt],
      { summarizeHistory: { threshold: 60, model } }
    )

    expect(result).toEqual([
      system('Be brief\n\nSummary of earlier conversation:\nsummary 1'),
      user('And Lyon?'),
    ])
  })

  test('keeps the tool steps of the current turn', async () => {
    const model = new TokenCountingModel()

    const result = await applyHistoryManagement(
      [...prompt, toolCall('1'), toolResult('1')],
      { summarizeHistory: { threshold: 60, model } }
    )

    expect(result.slice(1)).toEqual([
      user('And Lyon?'),
      toolCall('1'),
      toolResult('1'),
    ])
  })

  test('summarizes messages outside the rolling window', async () => {
    const model = new TokenCountingModel()

    const result = await applyHistoryManagement(prompt, {
      summarizeHistory: { threshold: 1000, model },
      rollingWindowMessages: 1,
    })

    expect(model.summarizedTexts()).toEqual([
      'Summarize this conversation.\n\n<conversation>\nUSER: Tell me about Paris\n\nASSISTANT: Paris is in France\n</conversation>',
    ])
    expect(result).toEqual([
      system('Summary of earlier conversation:\nsummary 1'),
      user('And Lyon?'),
    ])
  })

  test('summarizes only new messages on the next turn', async () => {
    const model = new TokenCountingModel()
    const options = {
      summarizeHistory: { threshold: 1000, model },
      rollingWindowMessages: 1,
    }

    await applyHistoryManagement(prompt, options)
    // A tool step of the same turn reuses the summary
    await applyHistoryManagement([...prompt, toolCall('1')], options)
    expect(model.doGenerate).toHaveBeenCalledTimes(1)

    await applyHistoryManagement(
      [...prompt, assistant('Lyon is in France'), user('Thanks')],
      options
    )

    expect(model.doGenerate).toHaveBeenCalledTimes(2)
    expect(model.summarizedTexts()[1]).toBe(
      'Summarize this conversation.\n\n<conversation>\nUSER: And Lyon?\n\nASSISTANT: Lyon is in France\n</conversation>'
    )
  })

  test('keeps the summaries of earlier chunks', async () => {
    const model = new TokenCountingModel()
    const history = Array.from({ length: 6 }, (_, index) =>
      index % 2 === 0 ? user(`question ${index}`) : assistant(`answer ${index}`)
    )

    const [summaryMessage] = await applyHistoryManagement(
      [...history, user('Last question')],
      { summarizeHistory: { threshold: 64, model } }
    )

    const summaries = model.doGenerate.mock.calls.map(
      (_, index) => `summary ${index + 1}`
    )
    expect(summaries.length).toBeGreaterThan(1)
    expect(summaryMessage).toEqual(
      system(`Summary of earlier conversation:\n${summaries.join('\n\n')}`)
    )
  })

  test('condenses the summary once it outgrows half the threshold', async () => {
    const model = new TokenCountingModel()
    model.doGenerate.mockImplementation(async (options) =>
      generationResult(
        String(options.prompt[0].content).startsWith('Condense')
          ? 'condensed'
          : 'a long chunk summary'
      )
    )
    const history = Array.from({ length: 6 }, (_, index) =>
      index % 2 === 0 ? user(`question ${index}`) : assistant(`answer ${index}`)
    )

    const [summaryMessage] = await applyHistoryManagement(
      [...history, user('Last question')],
      { summarizeHistory: { threshold: 40, model } }
    )

    expect(summaryMessage).toEqual(
      system('Summary of earlier conversation:\ncondensed')
    )
  })

  test('summarizes a long history in chunks under the threshold', async () => {
    const model = new TokenCountingModel()
    const history = Array.from({ length: 6 }, (_, index) =>
      index % 2 === 0 ? user(`question ${index}`) : assistant(`answer ${index}`)
    )

    await applyHistoryManagement([...history, user('Last question')], {
      summarizeHistory: { threshold: 40, model },
    })

    expect(model.doGenerate.mock.calls.length).toBeGreaterThan(1)
    const transcripts = model
      .summarizedTexts()
      .flatMap(
        (text) =>
          text.match(/<conversation>\n([\s\S]*)\n<\/conversation>/)?.[1] ?? []
      )
    expect(transcripts.length).toBeGreaterThan(1)
    for (const transcript of transcripts) {
      expect(transcript.length).toBeLessThanOrEqual(80)
    }
  })

  test('passes the abort signal to the summarizer', async () => {
    const model = new TokenCountingModel()
    const abortController = new AbortController()

    await applyHistoryManagement(
      prompt,
      { summarizeHistory: { threshold: 60, model } },
      abortController.signal
    )

    expect(model.doGenerate.mock.calls[0][0].abortSignal).toBe(
      abortController.signal
    )
  })
})

describe('wrapLanguageModelWithHistory', () => {
  test('sends the managed prompt to the wrapped model', async () => {
    const model = new TokenCountingModel()
    const doStream = mock(async (_options: LanguageModelV4CallOptions) => {
      throw new Error('done')
    })
    model.doStream = doStream

    const wrapped = wrapLanguageModelWithHistory(model, {
      rollingWindowMessages: 1,
    })

    await expect(
      wrapped.doStream({ prompt } as LanguageModelV4CallOptions)
    ).rejects.toThrow('done')
    expect(doStream.mock.calls[0][0].prompt).toEqual([user('And Lyon?')])
  })
})
