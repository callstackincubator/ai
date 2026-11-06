import {
  generateText,
  jsonSchema,
  Output,
  stepCountIs,
  streamText,
  tool,
} from 'ai'
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { LiteRTError } from '../errors'
import { createProviderWithRuntime } from '../provider'
import { createRuntime } from '../runtime'
import { FakeBinding } from './fakeBinding'

const MODEL = '/data/gemma.litertlm'
const realFetch = globalThis.fetch
const setFetch = (stub: unknown) => {
  globalThis.fetch = stub as typeof fetch
}

function setup() {
  const fake = new FakeBinding()
  const provider = createProviderWithRuntime((modelId, settings) =>
    createRuntime(modelId, settings, fake.binding)
  )
  return { fake, provider }
}

const weather = tool({
  description: 'Get the weather for a city.',
  inputSchema: jsonSchema<{ city: string }>({
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
    additionalProperties: false,
  }),
  execute: async ({ city }) => ({ city, temperature: 21 }),
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('generateText and streamText on a phone', () => {
  it('generates text and reports usage', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['Par', 'is'] })

    const result = await generateText({
      model: provider(MODEL),
      system: 'Be brief.',
      prompt: 'What is the capital of France?',
    })

    expect(result.text).toBe('Paris')
    expect(result.finishReason).toBe('stop')
    expect(result.usage.inputTokens).toBe(10)
    // The binding's stats estimate from characters. What it streamed is closer.
    expect(result.usage.outputTokens).toBe(2)
    expect(fake.resets).toEqual([
      { historyJson: undefined, systemPrompt: 'Be brief.' },
    ])
    expect(fake.executes[0]?.parts).toEqual([
      { type: 'text', text: 'What is the capital of France?' },
    ])
    expect(result.providerMetadata?.litert).toMatchObject({
      continued: false,
      reloaded: false,
    })
  })

  it('works out the rate from what Android streamed, past the first token', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['one', ' two', ' three', ' four', ' five'] })

    const result = await generateText({
      model: provider(MODEL),
      prompt: 'Count.',
    })

    // Four tokens after the first, in the 380 ms between the first token and the end.
    const metadata = result.providerMetadata?.litert as {
      tokensPerSecond: number
    }
    expect(metadata.tokensPerSecond).toBeCloseTo(4 / 0.38)
  })

  it('reports no rate for a one-token reply on Android', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['Paris'] })

    const result = await generateText({
      model: provider(MODEL),
      prompt: 'Capital of France?',
    })

    expect(result.providerMetadata?.litert).not.toHaveProperty(
      'tokensPerSecond'
    )
  })

  it('streams text as it is generated', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['Hel', 'lo', ' world'] })

    const result = streamText({ model: provider(MODEL), prompt: 'Say hello.' })
    const deltas: string[] = []
    for await (const delta of result.textStream) deltas.push(delta)

    expect(deltas).toEqual(['Hel', 'lo', ' world'])
    expect(await result.finishReason).toBe('stop')
  })

  it('passes maxOutputTokens per message and reports a cut-off answer', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a', 'b', 'c', 'd', 'e'] })

    const result = await generateText({
      model: provider(MODEL),
      prompt: 'Count.',
      maxOutputTokens: 5,
    })

    expect(fake.executes[0]?.options?.maxOutputTokens).toBe(5)
    expect(result.finishReason).toBe('length')
  })

  it('does not call a long word that fits a cut-off answer', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['Internationalization'] })

    const result = await generateText({
      model: provider(MODEL),
      prompt: 'Hi',
      maxOutputTokens: 5,
    })

    expect(result.finishReason).toBe('stop')
  })

  it('reports an answer cut off at the limit the binding sets when nothing else does', async () => {
    const { fake, provider } = setup()
    fake.turns.push(
      { tokens: Array.from({ length: 1024 }, () => 'x') },
      { tokens: ['x'] }
    )
    const model = provider(MODEL)

    expect(
      (await generateText({ model, prompt: 'A long story.' })).finishReason
    ).toBe('length')
    expect(
      (await generateText({ model, prompt: 'A short one.' })).finishReason
    ).toBe('stop')
  })

  it('reports thoughts that used up the limit as a cut-off answer', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: [] })

    const result = await generateText({
      model: provider(MODEL),
      prompt: 'Hi',
      reasoning: 'high',
    })

    expect(result.text).toBe('')
    expect(result.finishReason).toBe('length')
  })

  it('warns about a reload when an earlier call in the queue changed what is loaded', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] }, { tokens: ['b'] }, { tokens: ['c'] })
    const model = provider(MODEL)
    await generateText({ model, prompt: 'One' })

    const prompt = [
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'Two' }],
      },
    ]
    const [withTools, plain] = await Promise.all([
      model.doGenerate({
        prompt,
        tools: [
          {
            type: 'function',
            name: 'weather',
            inputSchema: { type: 'object' },
          },
        ],
      }),
      model.doGenerate({ prompt }),
    ])

    expect(withTools.warnings[0]).toMatchObject({ type: 'other' })
    expect(plain.warnings[0]).toMatchObject({ type: 'other' })
    expect(fake.loads).toHaveLength(3)
  })

  it('loads once for repeated calls, even through new model objects', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] }, { tokens: ['b'] })

    await generateText({ model: provider(MODEL), prompt: 'One' })
    await generateText({ model: provider(MODEL), prompt: 'Two' })

    expect(fake.loads).toHaveLength(1)
    expect(fake.instancesCreated).toBe(1)
  })
})

describe('conversation reuse', () => {
  it('continues when the prompt extends what the engine holds', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['Paris'] }, { tokens: ['Rome'] })
    const model = provider(MODEL)

    const first = await generateText({
      model,
      system: 'Be brief.',
      prompt: 'France?',
    })
    const second = await generateText({
      model,
      system: 'Be brief.',
      messages: [
        { role: 'user', content: 'France?' },
        ...first.response.messages,
        { role: 'user', content: 'Italy?' },
      ],
    })

    expect(second.providerMetadata?.litert).toMatchObject({ continued: true })
    expect(fake.resets).toHaveLength(1)
    expect(fake.executes[1]?.parts).toEqual([{ type: 'text', text: 'Italy?' }])
  })

  it('replays the history when it does not match', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['Paris'] }, { tokens: ['Rome'] })
    const model = provider(MODEL)

    await generateText({ model, prompt: 'France?' })
    const second = await generateText({
      model,
      messages: [
        { role: 'user', content: 'France?' },
        { role: 'assistant', content: 'An edited reply.' },
        { role: 'user', content: 'Italy?' },
      ],
    })

    expect(second.providerMetadata?.litert).toMatchObject({ continued: false })
    expect(fake.resets).toHaveLength(2)
    expect(JSON.parse(fake.resets[1]?.historyJson as string)).toEqual([
      { role: 'user', content: 'France?' },
      { role: 'model', content: 'An edited reply.' },
    ])
  })

  it('starts over when the system text changes', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] }, { tokens: ['b'] })
    const model = provider(MODEL)

    const first = await generateText({ model, system: 'One', prompt: 'Hi' })
    await generateText({
      model,
      system: 'Two',
      messages: [
        { role: 'user', content: 'Hi' },
        ...first.response.messages,
        { role: 'user', content: 'Again' },
      ],
    })

    expect(fake.resets[1]?.systemPrompt).toBe('Two')
  })

  it('continues after an app trims the reply', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: [' Paris \n'] }, { tokens: ['Rome'] })
    const model = provider(MODEL)

    await generateText({ model, prompt: 'France?' })
    const second = await generateText({
      model,
      messages: [
        { role: 'user', content: 'France?' },
        { role: 'assistant', content: 'Paris' },
        { role: 'user', content: 'Italy?' },
      ],
    })

    expect(second.providerMetadata?.litert).toMatchObject({ continued: true })
  })
})

describe('tools', () => {
  it('runs a tool loop without replaying the conversation', async () => {
    const { fake, provider } = setup()
    fake.turns.push(
      {
        tokens: [
          '<tool_call>{"name":"weather","arguments":{"city":"Tokyo"}}</tool_call>',
        ],
      },
      { tokens: ['It is 21 degrees.'] }
    )

    const result = await generateText({
      model: provider(MODEL),
      tools: { weather },
      stopWhen: stepCountIs(3),
      prompt: 'Weather in Tokyo?',
    })

    expect(result.text).toBe('It is 21 degrees.')
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0]?.finishReason).toBe('tool-calls')
    expect(result.steps[0]?.toolCalls[0]?.input).toEqual({ city: 'Tokyo' })
    expect(fake.loads).toHaveLength(1)
    expect(fake.resets).toHaveLength(1)
    expect(fake.loads[0]?.config.tools[0]).toMatchObject({
      name: 'weather',
      description: 'Get the weather for a city.',
    })
    expect(fake.executes[1]?.parts).toEqual([
      {
        type: 'toolResult',
        name: 'weather',
        responseJson: JSON.stringify({ city: 'Tokyo', temperature: 21 }),
      },
    ])
  })

  it('replays a tool exchange as the runtime expects', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['Done.'] })

    await generateText({
      model: provider(MODEL),
      messages: [
        { role: 'user', content: 'Weather?' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: '1',
              toolName: 'weather',
              input: { city: 'Rome' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: '1',
              toolName: 'weather',
              output: { type: 'json', value: { temperature: 21 } },
            },
          ],
        },
        { role: 'user', content: 'And now?' },
      ],
    })

    expect(JSON.parse(fake.resets[0]?.historyJson as string)).toEqual([
      { role: 'user', content: 'Weather?' },
      {
        role: 'model',
        content: '',
        toolCalls: [{ name: 'weather', argumentsJson: '{"city":"Rome"}' }],
      },
      { role: 'tool', content: '{"temperature":21}', toolName: 'weather' },
    ])
  })

  it('treats markers as text when the call has no tools', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['<tool_call>{"name":"x"}</tool_call>'] })

    const result = await generateText({ model: provider(MODEL), prompt: 'Hi' })

    expect(result.text).toBe('<tool_call>{"name":"x"}</tool_call>')
    expect(result.finishReason).toBe('stop')
  })
})

describe('settings that change per call', () => {
  it('reloads with a warning when tools change, and only then', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] }, { tokens: ['b'] }, { tokens: ['c'] })
    const model = provider(MODEL)

    const plain = await generateText({ model, prompt: 'Hi' })
    const withTools = await generateText({
      model,
      prompt: 'Hi',
      tools: { weather },
    })
    const again = await generateText({
      model,
      prompt: 'Hi',
      tools: { weather },
    })

    expect(fake.loads).toHaveLength(2)
    expect(plain.warnings ?? []).toHaveLength(0)
    expect(withTools.warnings?.[0]).toMatchObject({ type: 'other' })
    expect((withTools.warnings?.[0] as { message: string }).message).toContain(
      'tools'
    )
    expect(withTools.providerMetadata?.litert).toMatchObject({ reloaded: true })
    expect(again.warnings ?? []).toHaveLength(0)
  })

  it('frees the old engine first, and starts the new one with nothing left over', async () => {
    const { fake, provider } = setup()
    const order: string[] = []
    const createLLM = fake.binding.createLLM
    fake.binding.createLLM = () => {
      order.push('create')
      const llm = createLLM()
      const { unload, loadModel } = llm
      llm.unload = () => {
        order.push('unload')
        return unload()
      }
      llm.loadModel = ((...args: Parameters<typeof loadModel>) => {
        order.push('load')
        return loadModel(...args)
      }) as typeof loadModel
      return llm
    }
    fake.turns.push({ tokens: ['a'] }, { tokens: ['b'] })
    const model = provider(MODEL)

    await generateText({ model, prompt: 'Hi', temperature: 0 })
    await generateText({ model, prompt: 'Hi' })

    expect(order).toEqual(['create', 'load', 'unload', 'create', 'load'])
    expect(fake.closes).toBe(1)
    expect(fake.loads[1]?.config.temperature).toBeUndefined()
  })

  it('reloads with a warning when sampling changes', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] }, { tokens: ['b'] })
    const model = provider(MODEL)

    await generateText({ model, prompt: 'Hi', temperature: 0.2 })
    const second = await generateText({
      model,
      prompt: 'Hi',
      temperature: 0.9,
      topK: 5,
    })

    expect(fake.loads).toHaveLength(2)
    expect(fake.loads[1]?.config).toMatchObject({ temperature: 0.9, topK: 5 })
    expect((second.warnings?.[0] as { message: string }).message).toContain(
      'sampling'
    )
  })

  it('takes sampling defaults from the model settings without a reload warning', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] })

    const result = await generateText({
      model: provider(MODEL, {
        temperature: 0.1,
        maxContextTokens: 2048,
        backend: 'gpu',
        speculativeDecoding: true,
      }),
      prompt: 'Hi',
    })

    expect(fake.loads[0]?.config).toEqual({
      backend: 'gpu',
      maxContextTokens: 2048,
      enableSpeculativeDecoding: true,
      temperature: 0.1,
    })
    expect(result.warnings ?? []).toHaveLength(0)
  })

  it('warns about what the engine cannot do', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] })

    const result = await generateText({
      model: provider(MODEL),
      prompt: 'Hi',
      seed: 1,
      stopSequences: ['x'],
    })

    expect(
      (result.warnings ?? []).map(
        (warning) => (warning as { feature?: string }).feature
      )
    ).toEqual(['stopSequences', 'seed'])
  })

  it('passes penalties and reasoning per message', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] })

    await generateText({
      model: provider(MODEL),
      prompt: 'Hi',
      frequencyPenalty: 0.5,
      presencePenalty: 0.25,
      reasoning: 'none',
    })

    expect(fake.executes[0]?.options).toEqual({
      frequencyPenalty: 0.5,
      presencePenalty: 0.25,
      thinking: { enabled: false },
    })
  })
})

describe('reasoning', () => {
  it('stays off unless the call asks for it', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] }, { tokens: ['b'] })

    await generateText({ model: provider(MODEL), prompt: 'Hi' })
    await generateText({
      model: provider(MODEL),
      prompt: 'Hi',
      reasoning: 'high',
    })

    expect(fake.executes[0]?.options).toEqual({ thinking: { enabled: false } })
    expect(fake.executes[1]?.options).toEqual({ thinking: { enabled: true } })
  })
})

describe('structured output', () => {
  it('asks the engine for JSON and reads it', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['{"city":', '"Paris"}'] })

    const result = await generateText({
      model: provider(MODEL),
      prompt: 'Capital of France?',
      output: Output.object({
        schema: jsonSchema<{ city: string }>({
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        }),
      }),
    })

    expect(result.output).toEqual({ city: 'Paris' })
    expect(fake.loads[0]?.config.enableStructuredOutput).toBe(true)
    expect(JSON.parse(fake.executes[0]?.options.responseSchema)).toMatchObject({
      type: 'object',
    })
  })

  const answerSchema = jsonSchema<{ a: number }>({
    type: 'object',
    properties: { a: { type: 'number' } },
    required: ['a'],
  })

  it('reloads when structured output is turned on and off', async () => {
    const { fake, provider } = setup()
    fake.turns.push(
      { tokens: ['a'] },
      { tokens: ['{"a":1}'] },
      { tokens: ['b'] }
    )
    const model = provider(MODEL)

    await generateText({ model, prompt: 'One' })
    const structured = await generateText({
      model,
      prompt: 'Two',
      output: Output.object({ schema: answerSchema }),
    })
    const plainAfter = await generateText({ model, prompt: 'Three' })

    expect(fake.loads).toHaveLength(3)
    expect(fake.loads[1]?.config.enableStructuredOutput).toBe(true)
    expect(fake.loads[2]?.config.enableStructuredOutput).toBeUndefined()
    expect((structured.warnings?.[0] as { message: string }).message).toContain(
      'structured output'
    )
    expect(plainAfter.warnings).toHaveLength(1)
  })

  it('asks for JSON with no schema in the system text, with a warning and no reload', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] }, { tokens: ['{"a":1}'] })
    const model = provider(MODEL)
    await generateText({ model, prompt: 'One' })

    const result = await generateText({
      model,
      prompt: 'Two',
      output: Output.json(),
    })

    expect(result.output).toEqual({ a: 1 })
    expect(fake.loads).toHaveLength(1)
    expect(fake.resets.at(-1)?.systemPrompt).toContain('one JSON value')
    expect(fake.executes[1]?.options?.responseSchema).toBeUndefined()
    expect(result.warnings?.[0]).toMatchObject({
      type: 'compatibility',
      feature: 'structured output',
    })
  })

  it('asks for the schema in the system text when the call has tools, which a constraint would rule out', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['{"a":1}'] })

    const result = await generateText({
      model: provider(MODEL),
      prompt: 'Hi',
      tools: { weather },
      output: Output.object({ schema: answerSchema }),
    })

    expect(result.output).toEqual({ a: 1 })
    expect(fake.loads[0]?.config.enableStructuredOutput).toBeUndefined()
    expect(fake.executes[0]?.options?.responseSchema).toBeUndefined()
    expect(fake.resets[0]?.systemPrompt).toContain('JSON Schema')
    expect(result.warnings?.[0]).toMatchObject({
      type: 'compatibility',
      feature: 'structured output',
    })
  })

  it('removes a code fence, in a stream too', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['```json\n', '{"a":1}', '\n```'] })

    const result = streamText({
      model: provider(MODEL),
      prompt: 'JSON please.',
      output: Output.json(),
    })
    let text = ''
    for await (const delta of result.textStream) text += delta

    expect(text).toBe('{"a":1}')
  })
})

describe('the system taking the memory back', () => {
  it('loads the model again on the next call', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] }, { tokens: ['b'] })
    const model = provider(MODEL)
    await generateText({ model, prompt: 'One' })

    fake.ready = false
    const result = await generateText({ model, prompt: 'Two' })

    expect(result.text).toBe('b')
    expect(fake.loads).toHaveLength(2)
  })

  it('ends a stream with an error, and the next call loads again', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'], hangAfterTokens: true }, { tokens: ['b'] })
    const model = provider(MODEL)
    const errors: unknown[] = []

    const result = streamText({
      model,
      prompt: 'One',
      onError: ({ error }) => errors.push(error),
    })
    let streamed = ''
    for await (const delta of result.textStream) {
      streamed += delta
      fake.freeMemory()
    }

    expect(streamed).toBe('a')
    expect((errors[0] as LiteRTError).code).toBe('OUT_OF_MEMORY')
    expect((await generateText({ model, prompt: 'Two' })).text).toBe('b')
    expect(fake.loads).toHaveLength(2)
  })
})

describe('an abort while the model loads', () => {
  it('rejects at once, closes the instance, and the next call starts on a new one', async () => {
    const { fake, provider } = setup()
    let finishLoad = () => {}
    fake.holdLoad = new Promise((resolve) => {
      finishLoad = resolve
    })
    fake.turns.push({ tokens: ['ok'] })
    const model = provider(MODEL)
    const controller = new AbortController()

    const prepared = model
      .prepare({ abortSignal: controller.signal })
      .catch((e: unknown) => e)
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort()
    expect(((await prepared) as Error).name).toBe('AbortError')
    expect(fake.closes).toBe(1)

    const next = generateText({ model, prompt: 'Hi' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(fake.loads).toHaveLength(2)
    finishLoad()

    expect((await next).text).toBe('ok')
    expect(fake.instancesCreated).toBe(2)
  })

  it('does not use an abandoned instance when its load finishes after all', async () => {
    const { fake, provider } = setup()
    let finishLoad = () => {}
    fake.holdLoad = new Promise((resolve) => {
      finishLoad = resolve
    })
    const model = provider(MODEL)
    const controller = new AbortController()

    const prepared = model
      .prepare({ abortSignal: controller.signal })
      .catch((e: unknown) => e)
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort()
    await prepared
    finishLoad()
    await new Promise((resolve) => setTimeout(resolve, 5))
    fake.holdLoad = undefined
    fake.turns.push({ tokens: ['ok'] })

    expect((await generateText({ model, prompt: 'Hi' })).text).toBe('ok')
    expect(fake.loads).toHaveLength(2)
  })

  it('stops reporting progress', async () => {
    const { fake, provider } = setup()
    let finishLoad = () => {}
    fake.holdLoad = new Promise((resolve) => {
      finishLoad = resolve
    })
    const progress: unknown[] = []
    const controller = new AbortController()
    const model = provider(MODEL)

    const prepared = model
      .prepare({
        abortSignal: controller.signal,
        onProgress: (p) => progress.push(p),
      })
      .catch((e: unknown) => e)
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort()
    await prepared
    fake.loads[0]?.options.onProgress(0.9)
    finishLoad()
    await model.unload()

    expect(progress).toEqual([{ fraction: 0.5 }])
  })

  it('does not start with a signal that has already aborted', async () => {
    const { fake, provider } = setup()
    const controller = new AbortController()
    controller.abort()

    const error = await provider(MODEL)
      .prepare({ abortSignal: controller.signal })
      .catch((e: unknown) => e)

    expect((error as Error).name).toBe('AbortError')
    expect(fake.loads).toHaveLength(0)
  })

  it('says nothing about an abandoned load that fails', async () => {
    const { fake, provider } = setup()
    let finishLoad = () => {}
    fake.holdLoad = new Promise((resolve) => {
      finishLoad = resolve
    })
    fake.loadError = new Error(
      'The instance was closed before it finished loading.'
    )
    const controller = new AbortController()

    const prepared = provider(MODEL)
      .prepare({ abortSignal: controller.signal })
      .catch((e: unknown) => e)
    await new Promise((resolve) => setTimeout(resolve, 5))
    controller.abort()
    await prepared
    finishLoad()
    // An unhandled rejection here fails the test run.
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(fake.closes).toBe(1)
  })
})

describe('failure paths', () => {
  it.each([
    ['UNSUPPORTED', 'LOAD_FAILED'],
    ['INVALID_INPUT', 'LOAD_FAILED'],
    ['INFERENCE_FAILED', 'LOAD_FAILED'],
  ])('reports a %s error from a load as %s', async (nativeCode, code) => {
    const { fake, provider } = setup()
    fake.loadError = Object.assign(new Error('Nope'), { code: nativeCode })

    const error = await provider(MODEL)
      .prepare()
      .catch((e: unknown) => e)

    expect((error as LiteRTError).code).toBe(code)
  })

  it.each([['HTTP 404'], ['HTTP 401'], ['HTTP 403'], ['HTTP 410']])(
    'reports a download that got %s as no such model',
    async (status) => {
      const { fake, provider } = setup()
      fake.loadError = Object.assign(
        new Error(`Failed to download x: Failed to download model: ${status}`),
        {
          code: 'DOWNLOAD_FAILED',
        }
      )

      const error = await provider(MODEL)
        .prepare()
        .catch((e: unknown) => e)

      expect((error as LiteRTError).code).toBe('MODEL_NOT_FOUND')
    }
  )

  it('reports a download that got HTTP 500 as a failed download', async () => {
    const { fake, provider } = setup()
    fake.loadError = Object.assign(
      new Error('Failed to download x: HTTP 500'),
      {
        code: 'DOWNLOAD_FAILED',
      }
    )

    const error = await provider(MODEL)
      .prepare()
      .catch((e: unknown) => e)

    expect((error as LiteRTError).code).toBe('DOWNLOAD_FAILED')
  })

  const nativeError = (code: string, message: string) =>
    Object.assign(new Error(message), { code })

  it('reports a missing model and can try again', async () => {
    const { fake, provider } = setup()
    fake.loadError = nativeError(
      'MODEL_NOT_FOUND',
      'No file at /data/gemma.litertlm'
    )
    const model = provider(MODEL)

    const error = await generateText({ model, prompt: 'Hi' }).catch(
      (e: unknown) => e
    )
    expect(LiteRTError.isInstance(error)).toBe(true)
    expect((error as LiteRTError).code).toBe('MODEL_NOT_FOUND')
    expect((error as LiteRTError).message).toContain('/data/gemma.litertlm')

    fake.turns.push({ tokens: ['ok'] })
    const retry = await generateText({ model, prompt: 'Hi' })
    expect(retry.text).toBe('ok')
    expect(fake.instancesCreated).toBe(2)
  })

  it('reports a broken file', async () => {
    const { fake, provider } = setup()
    fake.loadError = nativeError('INVALID_MODEL', 'Not a .litertlm bundle')

    const error = await generateText({
      model: provider(MODEL),
      prompt: 'Hi',
    }).catch((e: unknown) => e)

    expect((error as LiteRTError).code).toBe('INVALID_MODEL')
    expect(fake.closes).toBe(1)
  })

  it('reports a truncated file as a broken one, not a missing one', async () => {
    const { fake, provider } = setup()
    fake.loadError = nativeError(
      'MODEL_NOT_FOUND',
      'Failed to create the engine — tried gpu, then the CPU fallbacks: Failed to create engine: NOT_FOUND: ERROR'
    )

    const error = await generateText({
      model: provider(MODEL),
      prompt: 'Hi',
    }).catch((e: unknown) => e)

    expect((error as LiteRTError).code).toBe('INVALID_MODEL')
  })

  it.each([
    'Failed to create the engine — tried cpu, then the CPU fallbacks: Failed to create engine: INVALID_ARGUMENT: Invalid magic number or failed to read the header',
    'Failed to create the engine (cpu): Unsupported or unknown file format. — tried cpu, then the CPU fallbacks',
  ])(
    'reports a file that is not a bundle as a broken one: %s',
    async (message) => {
      const { fake, provider } = setup()
      fake.loadError = nativeError('ENGINE_INIT_FAILED', message)

      const error = await generateText({
        model: provider(MODEL),
        prompt: 'Hi',
      }).catch((e: unknown) => e)

      expect((error as LiteRTError).code).toBe('INVALID_MODEL')
    }
  )

  it('reports a prompt longer than the context', async () => {
    const { fake, provider } = setup()
    fake.turns.push({
      tokens: [],
      failWith: nativeError(
        'INFERENCE_FAILED',
        'Inference failed: Input token ids are too long. 4903 >= 256'
      ),
    })

    const error = await generateText({
      model: provider(MODEL),
      prompt: 'Hi',
    }).catch((e: unknown) => e)

    expect((error as LiteRTError).code).toBe('CONTEXT_TOO_LONG')
  })

  it('reports a missing model through a stream as an error part', async () => {
    const { fake, provider } = setup()
    fake.loadError = nativeError('MODEL_NOT_FOUND', 'No file')

    const errors: unknown[] = []
    const result = streamText({
      model: provider(MODEL),
      prompt: 'Hi',
      onError: ({ error }) => errors.push(error),
    })
    await result.consumeStream()

    expect((errors[0] as LiteRTError).code).toBe('MODEL_NOT_FOUND')
  })

  it('reports a failed generation without showing the error token as text', async () => {
    const { fake, provider } = setup()
    fake.turns.push({
      tokens: ['par'],
      failWith: nativeError('INFERENCE_FAILED', 'GPU lost'),
    })

    const errors: unknown[] = []
    const result = streamText({
      model: provider(MODEL),
      prompt: 'Hi',
      onError: ({ error }) => errors.push(error),
    })
    let text = ''
    for await (const delta of result.textStream) text += delta

    expect(text).toBe('par')
    expect((errors[0] as LiteRTError).code).toBe('GENERATION_FAILED')
  })

  it('does not continue a conversation after a failure', async () => {
    const { fake, provider } = setup()
    fake.turns.push(
      { tokens: ['Paris'] },
      { tokens: [], failWith: new Error('boom') },
      { tokens: ['Rome'] }
    )
    const model = provider(MODEL)

    const first = await generateText({ model, prompt: 'France?' })
    const messages = [
      { role: 'user' as const, content: 'France?' },
      ...first.response.messages,
      { role: 'user' as const, content: 'Italy?' },
    ]
    await generateText({ model, messages }).catch(() => {})
    const third = await generateText({ model, messages })

    expect(third.providerMetadata?.litert).toMatchObject({ continued: false })
  })

  it('stops on abort and works again after it', async () => {
    const { fake, provider } = setup()
    fake.turns.push(
      { tokens: ['one ', 'two '], hangAfterTokens: true },
      { tokens: ['fresh'] }
    )
    const model = provider(MODEL)
    const controller = new AbortController()

    const result = streamText({
      model,
      prompt: 'Count.',
      abortSignal: controller.signal,
    })
    const parts: string[] = []
    let aborted = false
    for await (const part of result.fullStream) {
      parts.push(part.type)
      if (part.type === 'text-delta' && !controller.signal.aborted)
        controller.abort()
      if (part.type === 'abort') aborted = true
    }

    expect(aborted).toBe(true)
    expect(fake.resets.length).toBeGreaterThanOrEqual(2)

    const next = await generateText({ model, prompt: 'Again.' })
    expect(next.text).toBe('fresh')
    expect(next.providerMetadata?.litert).toMatchObject({ continued: false })
  })

  it('rejects generateText with an AbortError', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['one '], hangAfterTokens: true })
    const controller = new AbortController()

    const pending = generateText({
      model: provider(MODEL),
      prompt: 'Count.',
      abortSignal: controller.signal,
    })
    setTimeout(() => controller.abort(), 10)

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does nothing for a signal already aborted', async () => {
    const { fake, provider } = setup()
    const controller = new AbortController()
    controller.abort()

    await expect(
      generateText({
        model: provider(MODEL),
        prompt: 'Hi',
        abortSignal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fake.loads).toHaveLength(0)
  })

  it('reports a tool call whose JSON is broken as a tool error', async () => {
    const { fake, provider } = setup()
    fake.turns.push({
      tokens: ['<tool_call>{"name":"weather","arguments":{"city":</tool_call>'],
    })

    const result = streamText({
      model: provider(MODEL),
      tools: { weather },
      prompt: 'Weather?',
    })
    const parts: any[] = []
    for await (const part of result.fullStream) parts.push(part)

    const toolError = parts.find((part) => part.type === 'tool-error')
    expect(toolError?.toolName).toBe('weather')
    expect(await result.text).toBe('')
    expect(await result.finishReason).toBe('tool-calls')
  })

  it('reports a tool call with no readable name as a tool error', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['<tool_call>not json at all</tool_call>'] })

    const result = await generateText({
      model: provider(MODEL),
      tools: { weather },
      prompt: 'Weather?',
    })

    expect(result.text).toBe('')
    expect(result.content.some((part) => part.type === 'tool-error')).toBe(true)
  })

  it('lets the model recover from a broken call on the next step', async () => {
    const { fake, provider } = setup()
    fake.turns.push(
      {
        tokens: [
          '<tool_call>{"name":"weather","arguments":{"city":</tool_call>',
        ],
      },
      {
        tokens: [
          '<tool_call>{"name":"weather","arguments":{"city":"Oslo"}}</tool_call>',
        ],
      },
      { tokens: ['Mild.'] }
    )

    const result = await generateText({
      model: provider(MODEL),
      tools: { weather },
      stopWhen: stepCountIs(4),
      prompt: 'Weather in Oslo?',
    })

    expect(result.text).toBe('Mild.')
    expect(result.steps).toHaveLength(3)
  })

  it('refuses images with a clear error before loading', async () => {
    const { fake, provider } = setup()

    await expect(
      generateText({
        model: provider(MODEL),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: new Uint8Array(4),
                mediaType: 'image/png',
              },
            ],
          },
        ],
      })
    ).rejects.toThrow(/text prompts only/)
    expect(fake.loads).toHaveLength(0)
  })
})

describe('choosing a file from a repo', () => {
  const tree = [
    {
      type: 'file',
      path: 'gemma-gpu.litertlm',
      size: 2,
      lfs: { oid: 'a'.repeat(64) },
    },
    {
      type: 'file',
      path: 'gemma.litertlm',
      size: 3,
      lfs: { oid: 'b'.repeat(64) },
    },
    { type: 'file', path: 'gemma_NPU_Uncompiled.litertlm', size: 4 },
  ]

  const stubFetch = (status: number, body: unknown) => {
    const fetchStub = mock(
      async () => new Response(JSON.stringify(body), { status })
    )
    setFetch(fetchStub)
    return fetchStub
  }

  it('downloads the full bundle on Android and checks its SHA-256', async () => {
    const { fake, provider } = setup()
    stubFetch(200, tree)
    fake.turns.push({ tokens: ['ok'] })

    await generateText({ model: provider('hf://org/gemma'), prompt: 'Hi' })

    expect(fake.loads[0]?.path).toBe(
      'https://huggingface.co/org/gemma/resolve/main/gemma.litertlm'
    )
    expect(fake.loads[0]?.options.sha256).toBe('b'.repeat(64))
  })

  it('downloads the GPU file on iOS', async () => {
    const { fake, provider } = setup()
    fake.platform = 'ios'
    stubFetch(200, tree)
    fake.turns.push({ tokens: ['ok'] })

    await generateText({ model: provider('hf://org/gemma'), prompt: 'Hi' })

    expect(fake.loads[0]?.path).toBe(
      'https://huggingface.co/org/gemma/resolve/main/gemma-gpu.litertlm'
    )
    expect(fake.loads[0]?.options.sha256).toBe('a'.repeat(64))
  })

  it('loads the file already on the phone when the Hub does not answer', async () => {
    const { fake, provider } = setup()
    fake.keptFiles = ['other.litertlm', 'gemma-gpu.litertlm', 'gemma.litertlm']
    setFetch(
      mock(async () => {
        throw new TypeError('Network request failed')
      })
    )
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    fake.turns.push({ tokens: ['ok'] })

    const result = await generateText({
      model: provider('hf://org/gemma'),
      prompt: 'Hi',
    })

    expect(result.text).toBe('ok')
    expect(fake.loads[0]?.path).toBe(
      'https://huggingface.co/org/gemma/resolve/main/gemma.litertlm'
    )
    expect(fake.loads[0]?.options.sha256).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('loads the file already on the phone when the Hub limits the rate', async () => {
    const { fake, provider } = setup()
    fake.keptFiles = ['gemma.litertlm']
    stubFetch(429, {})
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    fake.turns.push({ tokens: ['ok'] })

    await generateText({ model: provider('hf://org/gemma'), prompt: 'Hi' })

    expect(fake.loads[0]?.path).toContain('gemma.litertlm')
    warn.mockRestore()
  })

  it('says the download failed when the Hub does not answer and nothing from the repo is here', async () => {
    const { fake, provider } = setup()
    fake.keptFiles = ['other.litertlm']
    setFetch(
      mock(async () => {
        throw new TypeError('Network request failed')
      })
    )

    const error = await generateText({
      model: provider('hf://org/gemma'),
      prompt: 'Hi',
    }).catch((e: unknown) => e)

    expect((error as LiteRTError).code).toBe('DOWNLOAD_FAILED')
    expect(fake.loads).toHaveLength(0)
  })

  it('loads the file already on the phone when a sign-in page comes back for the list', async () => {
    const { fake, provider } = setup()
    fake.keptFiles = ['gemma.litertlm']
    setFetch(mock(async () => new Response('<html>Sign in</html>')))
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    fake.turns.push({ tokens: ['ok'] })

    await generateText({ model: provider('hf://org/gemma'), prompt: 'Hi' })

    expect(fake.loads[0]?.path).toContain('gemma.litertlm')
    warn.mockRestore()
  })

  it('says the download failed when a sign-in page comes back and nothing is kept', async () => {
    const { provider } = setup()
    setFetch(mock(async () => new Response('<html>Sign in</html>')))

    const error = await generateText({
      model: provider('hf://org/gemma'),
      prompt: 'Hi',
    }).catch((e: unknown) => e)

    expect((error as LiteRTError).code).toBe('DOWNLOAD_FAILED')
  })

  it('does not fall back on a kept file when the repo is gone', async () => {
    const { provider, fake } = setup()
    fake.keptFiles = ['gemma.litertlm']
    stubFetch(404, {})

    const error = await generateText({
      model: provider('hf://org/gemma'),
      prompt: 'Hi',
    }).catch((e: unknown) => e)

    expect((error as LiteRTError).code).toBe('MODEL_NOT_FOUND')
  })

  it('reads the same id with no scheme', async () => {
    const { fake, provider } = setup()
    stubFetch(200, tree)
    fake.turns.push({ tokens: ['ok'] })

    await generateText({
      model: provider('org/gemma', { backend: 'cpu' }),
      prompt: 'Hi',
    })

    expect(fake.loads[0]?.path).toBe(
      'https://huggingface.co/org/gemma/resolve/main/gemma.litertlm'
    )
  })

  it('goes straight to a named file, with its hash so another revision of it gets downloaded', async () => {
    const { fake, provider } = setup()
    stubFetch(200, tree)
    fake.turns.push({ tokens: ['ok'] })

    await generateText({
      model: provider('hf://org/gemma@abc/gemma.litertlm'),
      prompt: 'Hi',
    })

    expect(fake.loads[0]?.path).toBe(
      'https://huggingface.co/org/gemma/resolve/abc/gemma.litertlm'
    )
    expect(fake.loads[0]?.options.sha256).toBe('b'.repeat(64))
    expect(fake.manifestCalls).toHaveLength(0)
  })

  it('finds a named file in a folder', async () => {
    const { fake, provider } = setup()
    const fetchStub = stubFetch(200, [
      {
        type: 'file',
        path: 'gpu/gemma.litertlm',
        lfs: { oid: 'c'.repeat(64) },
      },
    ])
    fake.turns.push({ tokens: ['ok'] })

    await generateText({
      model: provider('hf://org/gemma/gpu/gemma.litertlm'),
      prompt: 'Hi',
    })

    expect(fetchStub.mock.calls[0]?.[0 as never]).toBe(
      'https://huggingface.co/api/models/org/gemma/tree/main/gpu'
    )
    expect(fake.loads[0]?.options.sha256).toBe('c'.repeat(64))
  })

  it('loads a named file with no hash when the Hub does not answer', async () => {
    const { fake, provider } = setup()
    setFetch(
      mock(async () => {
        throw new TypeError('Network request failed')
      })
    )
    fake.turns.push({ tokens: ['ok'] })

    await generateText({
      model: provider('hf://org/gemma/gemma.litertlm'),
      prompt: 'Hi',
    })

    expect(fake.loads[0]?.path).toContain('gemma.litertlm')
    expect(fake.loads[0]?.options.sha256).toBeUndefined()
  })

  it('takes the sha256 it is given over the Hub, and does not ask', async () => {
    const { fake, provider } = setup()
    const fetchStub = stubFetch(200, tree)
    fake.turns.push({ tokens: ['ok'] })

    await generateText({
      model: provider('hf://org/gemma/gemma.litertlm', {
        sha256: 'd'.repeat(64),
      }),
      prompt: 'Hi',
    })

    expect(fake.loads[0]?.options.sha256).toBe('d'.repeat(64))
    expect(fetchStub).not.toHaveBeenCalled()
  })

  it('uses a manifest when the repo has one', async () => {
    const { fake, provider } = setup()
    fake.manifest = {
      url: 'https://huggingface.co/org/m/resolve/main/best.litertlm',
      config: { backend: 'gpu', temperature: 0.2 },
      sha256: 'c'.repeat(64),
      streamChannels: [
        { type: 'toolCall', start: '<tool_call>', end: '</tool_call>' },
        { type: 'thinking', start: '<think>', end: '</think>' },
      ],
    }
    fake.turns.push({ tokens: ['<think>Hmm</think>Hello'] })

    const result = await generateText({
      model: provider('hf://org/m'),
      prompt: 'Hi',
    })

    expect(fake.loads[0]?.path).toContain('best.litertlm')
    expect(fake.loads[0]?.config).toEqual({ backend: 'gpu', temperature: 0.2 })
    expect(fake.loads[0]?.options.sha256).toBe('c'.repeat(64))
    expect(result.text).toBe('Hello')
    expect(result.reasoningText).toBe('Hmm')
  })

  it('reports a repo that does not exist', async () => {
    const { fake, provider } = setup()
    stubFetch(404, { error: 'Repository not found' })

    const error = await generateText({
      model: provider('hf://org/nope'),
      prompt: 'Hi',
    }).catch((e: unknown) => e)

    expect((error as LiteRTError).code).toBe('MODEL_NOT_FOUND')
    expect(fake.loads).toHaveLength(0)
  })

  it('reports a repo without a usable file and names what it has', async () => {
    const { provider } = setup()
    stubFetch(200, [{ type: 'file', path: 'x_NPU_y.litertlm', size: 1 }])

    const error = await generateText({
      model: provider('hf://org/npu-only'),
      prompt: 'Hi',
    }).catch((e: unknown) => e)

    expect((error as LiteRTError).code).toBe('MODEL_NOT_FOUND')
    expect((error as LiteRTError).message).toContain(
      'hf://org/npu-only/x_NPU_y.litertlm'
    )
  })

  it('sends a token for a gated repo', async () => {
    const { fake, provider } = setup()
    const fetchStub = stubFetch(200, tree)
    fake.turns.push({ tokens: ['ok'] })

    await generateText({
      model: provider('hf://org/gemma', { accessToken: 't' }),
      prompt: 'Hi',
    })

    const init = fetchStub.mock.calls[0] as unknown as [string, RequestInit]
    expect(init[1].headers).toEqual({ Authorization: 'Bearer t' })
    expect(fake.loads[0]?.options.headers).toEqual({
      Authorization: 'Bearer t',
    })
  })
})

describe('the provider', () => {
  it('prepares ahead of the first call and reports progress', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['ok'] })
    const model = provider(MODEL)
    const progress: unknown[] = []

    await model.prepare({ onProgress: (p) => progress.push(p) })
    const result = await generateText({ model, prompt: 'Hi' })

    expect(progress).toEqual([{ fraction: 0.5 }])
    expect(fake.loads).toHaveLength(1)
    expect(result.warnings ?? []).toHaveLength(0)
  })

  it('runs calls one at a time', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] }, { tokens: ['b'] })
    const model = provider(MODEL)

    const [first, second] = await Promise.all([
      generateText({ model, prompt: 'One' }),
      generateText({ model, prompt: 'Two' }),
    ])

    expect([first.text, second.text]).toEqual(['a', 'b'])
    expect(fake.executes.map((e) => e.parts[0].text)).toEqual(['One', 'Two'])
  })

  it('unloads the loaded model before loading another', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] }, { tokens: ['b'] })

    await generateText({ model: provider('/data/a.litertlm'), prompt: 'Hi' })
    await generateText({ model: provider('/data/b.litertlm'), prompt: 'Hi' })

    expect(fake.unloads).toBe(1)
    expect(fake.closes).toBe(1)
    expect(fake.loads.map((load) => load.path)).toEqual([
      '/data/a.litertlm',
      '/data/b.litertlm',
    ])
  })

  it('loads again after unload', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] }, { tokens: ['b'] })
    const model = provider(MODEL)

    await generateText({ model, prompt: 'Hi' })
    await model.unload()
    await generateText({ model, prompt: 'Hi' })

    expect(fake.loads).toHaveLength(2)
  })

  it('frees everything with unloadAll', async () => {
    const { fake, provider } = setup()
    fake.turns.push({ tokens: ['a'] })

    await generateText({ model: provider(MODEL), prompt: 'Hi' })
    await provider.unloadAll()

    expect(fake.unloads).toBe(1)
  })

  it('has no embedding or image models', () => {
    const { provider } = setup()
    expect(() => provider.embeddingModel('x')).toThrow(/No such embeddingModel/)
    expect(() => provider.imageModel('x')).toThrow(/No such imageModel/)
  })

  it('names itself', () => {
    const { provider } = setup()
    const model = provider(MODEL)
    expect(model.specificationVersion).toBe('v4')
    expect(model.provider).toBe('litert')
    expect(model.modelId).toBe(MODEL)
    expect(provider.languageModel(MODEL).modelId).toBe(MODEL)
  })
})
