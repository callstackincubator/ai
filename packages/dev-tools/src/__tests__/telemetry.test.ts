import type { HrTime } from '@opentelemetry/api'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { beforeEach, describe, expect, test } from 'bun:test'

import { AiSdkDevToolsSpanExporter } from '../react-native/span-exporter'
import { AiSdkTelemetryRecorder } from '../react-native/telemetry-recorder'

function hrTime(seconds: number, nanos = 0): HrTime {
  return [seconds, nanos]
}

function makeSpan(overrides: Partial<ReadableSpan> = {}): ReadableSpan {
  return {
    name: 'ai.generateText',
    spanContext: () => ({
      spanId: 'span-1',
      traceId: 'trace-1',
      traceFlags: 1,
    }),
    startTime: hrTime(1, 500_000),
    duration: hrTime(0, 2_000_000),
    attributes: { 'ai.operationId': 'ai.generateText' },
    resource: { attributes: { 'service.name': 'app' } },
    events: [],
    ...overrides,
  } as unknown as ReadableSpan
}

const exported: unknown[] = []

beforeEach(() => {
  exported.length = 0
})

describe('AiSdkTelemetryRecorder', () => {
  test('converts AI SDK spans and sends them when a sender exists', () => {
    const recorder = new AiSdkTelemetryRecorder()
    recorder.setSender((span) => exported.push(span))

    recorder.record(
      makeSpan({
        events: [
          {
            name: 'checkpoint',
            time: hrTime(0, 1_000_000),
            attributes: undefined,
          },
        ] as ReadableSpan['events'],
      })
    )

    expect(exported).toHaveLength(1)
    expect(exported[0]).toEqual({
      spanId: 'span-1',
      traceId: 'trace-1',
      name: 'ai.generateText',
      startTime: 1001,
      duration: 2,
      attributes: { 'ai.operationId': 'ai.generateText' },
      resource: { 'service.name': 'app' },
      events: [{ name: 'checkpoint', time: 1, attributes: {} }],
    })
  })

  test('detects AI SDK spans by gen_ai attributes too', () => {
    const recorder = new AiSdkTelemetryRecorder()
    recorder.setSender((span) => exported.push(span))

    recorder.record(
      makeSpan({
        name: 'other.span',
        attributes: { 'gen_ai.system': 'openai' },
      })
    )

    expect(exported).toHaveLength(1)
  })

  test('ignores non-AI SDK spans with a warning', () => {
    const warnings: unknown[][] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => warnings.push(args)

    try {
      const recorder = new AiSdkTelemetryRecorder()
      recorder.setSender((span) => exported.push(span))

      recorder.record(makeSpan({ name: 'http.request', attributes: {} }))

      expect(exported).toHaveLength(0)
      expect(warnings).toHaveLength(1)
    } finally {
      console.warn = originalWarn
    }
  })

  test('does not record while disabled', () => {
    const recorder = new AiSdkTelemetryRecorder()
    recorder.setSender((span) => exported.push(span))
    recorder.disable()

    recorder.record(makeSpan())
    expect(exported).toHaveLength(0)

    recorder.enable()
    recorder.record(makeSpan())
    expect(exported).toHaveLength(1)
  })

  test('buffers spans until a sender attaches, then flushes in order', () => {
    const recorder = new AiSdkTelemetryRecorder()

    recorder.record(makeSpan({ name: 'ai.one' }))
    recorder.record(makeSpan({ name: 'ai.two' }))
    expect(exported).toHaveLength(0)

    recorder.setSender((span) => exported.push(span))

    expect(exported.map((span) => (span as { name: string }).name)).toEqual([
      'ai.one',
      'ai.two',
    ])

    recorder.record(makeSpan({ name: 'ai.three' }))
    expect(exported).toHaveLength(3)
  })

  test('drops the oldest buffered span beyond maxQueueSize', () => {
    const recorder = new AiSdkTelemetryRecorder()
    recorder.updateConfig({ maxQueueSize: 2 })

    recorder.record(makeSpan({ name: 'ai.one' }))
    recorder.record(makeSpan({ name: 'ai.two' }))
    recorder.record(makeSpan({ name: 'ai.three' }))

    recorder.setSender((span) => exported.push(span))

    expect(exported.map((span) => (span as { name: string }).name)).toEqual([
      'ai.two',
      'ai.three',
    ])
  })

  test('stops buffering when the sender detaches', () => {
    const recorder = new AiSdkTelemetryRecorder()
    recorder.setSender((span) => exported.push(span))
    recorder.setSender(undefined)

    recorder.record(makeSpan())

    expect(exported).toHaveLength(0)
  })
})

describe('AiSdkDevToolsSpanExporter', () => {
  test('forwards every span to the recorder and reports success', () => {
    const recorder = new AiSdkTelemetryRecorder()
    recorder.setSender((span) => exported.push(span))
    const exporter = new AiSdkDevToolsSpanExporter(recorder)

    const results: { code: number }[] = []
    exporter.export([makeSpan(), makeSpan()], (result) =>
      results.push(result as { code: number })
    )

    expect(exported).toHaveLength(2)
    expect(results).toEqual([{ code: 0 }])
  })

  test('fails exports after shutdown', async () => {
    const recorder = new AiSdkTelemetryRecorder()
    recorder.setSender((span) => exported.push(span))
    const exporter = new AiSdkDevToolsSpanExporter(recorder)

    await exporter.shutdown()

    const results: { code: number }[] = []
    exporter.export([makeSpan()], (result) =>
      results.push(result as { code: number })
    )

    expect(exported).toHaveLength(0)
    expect(results).toEqual([{ code: 1 }])
  })

  test('forceFlush resolves', async () => {
    const exporter = new AiSdkDevToolsSpanExporter(new AiSdkTelemetryRecorder())

    await expect(exporter.forceFlush()).resolves.toBeUndefined()
  })
})
