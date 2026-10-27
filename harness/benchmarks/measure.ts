import type { streamText } from 'ai'
import { activateKeepAwakeAsync } from 'expo-keep-awake'
import RNBlobUtil from 'react-native-blob-util'

import DeviceStats from '../../apps/expo-example/modules/device-stats'
import { LONG_PROMPT, SHORT_PROMPT } from './prompts'

export const PROMPTS = { short: SHORT_PROMPT, long: LONG_PROMPT }
export type PromptName = keyof typeof PROMPTS

// A benchmark runs longer than the auto-lock delay, and a locked device
// suspends the app
activateKeepAwakeAsync('benchmark')

export const MAX_OUTPUT_TOKENS = 256
// Measured runs per configuration, after one warmup run that is not counted
export const RUNS = 3
export const LOAD_RUNS = 3

export type GenerationRun = {
  promptTokens: number
  outputTokens: number
  // Time from the call to the first generated token
  ttftMs: number
  // Prompt tokens over the time to first token, so it includes the first
  // decode step and the runtime's own overhead
  prefillTokensPerSecond: number
  // Tokens after the first over the time between the first and last token
  decodeTokensPerSecond: number
  totalMs: number
}

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export function toRun({
  promptTokens,
  outputTokens,
  startMs,
  firstTokenMs,
  endMs,
}: {
  promptTokens: number
  outputTokens: number
  startMs: number
  firstTokenMs: number
  endMs: number
}): GenerationRun {
  const ttftMs = firstTokenMs - startMs
  return {
    promptTokens,
    outputTokens,
    ttftMs,
    prefillTokensPerSecond: (promptTokens / ttftMs) * 1000,
    decodeTokensPerSecond: ((outputTokens - 1) / (endMs - firstTokenMs)) * 1000,
    totalMs: endMs - startMs,
  }
}

// Times a streamText call from the call to the last part. The first token is
// the first text or reasoning delta
export async function measureStream(
  start: () => ReturnType<typeof streamText>
): Promise<GenerationRun> {
  const startMs = performance.now()
  const result = start()
  let firstTokenMs = 0
  for await (const part of result.fullStream) {
    if (
      !firstTokenMs &&
      (part.type === 'text-delta' || part.type === 'reasoning-delta')
    ) {
      firstTokenMs = performance.now()
    }
    if (part.type === 'error') throw part.error
  }
  const endMs = performance.now()
  const usage = await result.usage
  return toRun({
    promptTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    startMs,
    firstTokenMs,
    endMs,
  })
}

export async function timeMs(fn: () => Promise<unknown>) {
  const startMs = performance.now()
  await fn()
  return performance.now() - startMs
}

// Highest process footprint while fn runs, in MB
export async function withPeakMemory<T>(fn: () => Promise<T>) {
  DeviceStats.startSampling(10)
  try {
    const value = await fn()
    return { value, peakMemoryMB: DeviceStats.stopSampling() / 2 ** 20 }
  } catch (error) {
    DeviceStats.stopSampling()
    throw error
  }
}

export function footprintMB() {
  return DeviceStats.getFootprint() / 2 ** 20
}

// Waits until the device is no longer throttled, at most COOLDOWN_LIMIT_MS, so
// heat from an earlier stage doesn't slow down the next one
const COOLDOWN_LIMIT_MS = 5 * 60 * 1000

export async function waitForCooldown() {
  const startMs = performance.now()
  while (
    DeviceStats.getThermalState() !== 'nominal' &&
    performance.now() - startMs < COOLDOWN_LIMIT_MS
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
}

function deviceState() {
  return {
    thermalState: DeviceStats.getThermalState(),
    lowPowerMode: DeviceStats.isLowPowerModeEnabled(),
  }
}

// Runs one warmup generation, then RUNS measured ones, and reports the median
// of each metric. The warmup run is reported as `first`, since some runtimes
// finish preparing the model on the first generation. The peak footprint
// covers all runs
export async function benchmarkPrompt(
  generate: (prompt: string) => Promise<GenerationRun>,
  promptName: PromptName
) {
  await waitForCooldown()
  const before = deviceState()
  const {
    value: [first, ...runs],
    peakMemoryMB,
  } = await withPeakMemory(async () => {
    const results: GenerationRun[] = []
    for (let i = 0; i <= RUNS; i++) {
      results.push(await generate(PROMPTS[promptName]))
    }
    return results
  })
  const pick = (key: keyof GenerationRun) => median(runs.map((run) => run[key]))
  return {
    prompt: promptName,
    promptTokens: pick('promptTokens'),
    outputTokens: pick('outputTokens'),
    ttftMs: pick('ttftMs'),
    prefillTokensPerSecond: pick('prefillTokensPerSecond'),
    decodeTokensPerSecond: pick('decodeTokensPerSecond'),
    totalMs: pick('totalMs'),
    peakMemoryMB,
    first,
    runs,
    // The device state before and after the runs
    before,
    after: deviceState(),
  }
}

// Results are appended to a file in the app's documents, one JSON line each,
// which harness/benchmarks/collect.ts turns into tables. Copy it off the device
// with `xcrun devicectl device copy from` (see README.md)
export const RESULTS_PATH = `${RNBlobUtil.fs.dirs.DocumentDir}/benchmarks.jsonl`

export async function report(runtime: string, result: Record<string, unknown>) {
  const line = `BENCHMARK ${JSON.stringify({ runtime, ...result })}`
  console.log(line)
  await RNBlobUtil.fs.appendFile(RESULTS_PATH, `${line}\n`, 'utf8')
}
