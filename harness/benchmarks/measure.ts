import type { streamText } from 'ai'
import { activateKeepAwakeAsync } from 'expo-keep-awake'
import RNBlobUtil from 'react-native-blob-util'

import DeviceStats, {
  type ThermalState,
} from '../../apps/expo-example/modules/device-stats'
import { MODEL_NAME } from './models'
import { LONG_PROMPT, SHORT_PROMPT } from './prompts'

export const PROMPTS = { short: SHORT_PROMPT, long: LONG_PROMPT }
export type PromptName = keyof typeof PROMPTS

// A benchmark runs longer than the auto-lock delay, and a locked device
// suspends the app
activateKeepAwakeAsync('benchmark')

// Recorded with every result. collect.ts only combines results of one
// version, so results from before a change to the protocol (README.md) don't
// mix with results after it
export const PROTOCOL_VERSION = 2

// Both prompts ask for more than this, so every run decodes the same number
// of tokens. A run that stops earlier is left out of the statistics
export const MAX_OUTPUT_TOKENS = 256
// Runs per prompt: warmup runs, which are not counted, then measured runs
export const WARMUP_RUNS = 3
export const RUNS = 10
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
  // The same timings taken inside the runtime, for runtimes that report them.
  // The difference to the JS timings is what getting the tokens to JS costs,
  // which a debug build (the harness can only run those) makes slower
  native?: NativeTimings
}

export type NativeTimings = {
  ttftMs: number
  decodeTokensPerSecond: number
}

type MeasuredRun = GenerationRun & {
  peakMemoryMB: number
  // The worst thermal state during the run
  thermalState: ThermalState
}

// Linear interpolation between the closest ranks
function quantile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower)
}

export function median(values: number[]) {
  return quantile(values, 0.5)
}

// The median, with the interquartile range and the range as the spread
function summarize(values: number[]) {
  if (!values.length) return undefined
  return {
    median: median(values),
    p25: quantile(values, 0.25),
    p75: quantile(values, 0.75),
    min: Math.min(...values),
    max: Math.max(...values),
  }
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
    decodeTokensPerSecond: decodeTokensPerSecond(
      outputTokens,
      firstTokenMs,
      endMs
    ),
    totalMs: endMs - startMs,
  }
}

// Times a streamText call from the call to the last part. The first token is
// the first text or reasoning delta. readNative reads the runtime's own
// timings from the provider metadata
export async function measureStream(
  start: () => ReturnType<typeof streamText>,
  readNative?: (
    metadata: Record<string, any> | undefined,
    outputTokens: number
  ) => NativeTimings | undefined
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
  const run = toRun({
    promptTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    startMs,
    firstTokenMs,
    endMs,
  })
  run.native = readNative?.(await result.providerMetadata, run.outputTokens)
  return run
}

// Decode speed from the time of the first and the last token
export function decodeTokensPerSecond(
  outputTokens: number,
  firstTokenMs: number,
  endMs: number
) {
  return ((outputTokens - 1) / (endMs - firstTokenMs)) * 1000
}

export async function timeMs(fn: () => Promise<unknown>) {
  const startMs = performance.now()
  await fn()
  return performance.now() - startMs
}

// Highest process footprint while fn runs, in MB, and the worst thermal state
export async function withPeakMemory<T>(fn: () => Promise<T>) {
  DeviceStats.startSampling(10)
  try {
    const value = await fn()
    return {
      value,
      peakMemoryMB: DeviceStats.stopSampling() / 2 ** 20,
      thermalState: DeviceStats.getSampledThermalState(),
    }
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

// The footprint after the model is unloaded, and what it keeps above the
// footprint before it loaded. Waits for memory freed asynchronously
export async function memoryAfterUnload(baselineMB: number) {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const unloadedMB = footprintMB()
  return { baselineMB, unloadedMB, retainedMB: unloadedMB - baselineMB }
}

function deviceState() {
  return {
    thermalState: DeviceStats.getThermalState(),
    lowPowerMode: DeviceStats.isLowPowerModeEnabled(),
  }
}

// Runs WARMUP_RUNS generations, then RUNS measured ones, each after the
// device cooled down, and reports the median and spread of each metric. Runs
// that throttled the device or stopped before MAX_OUTPUT_TOKENS are left out.
// The first warmup run is reported as `first`, since some runtimes finish
// preparing the model on the first generation
export async function benchmarkPrompt(
  generate: (prompt: string) => Promise<GenerationRun>,
  promptName: PromptName
) {
  const before = deviceState()
  const runs: MeasuredRun[] = []
  for (let i = 0; i < WARMUP_RUNS + RUNS; i++) {
    await waitForCooldown()
    const { value, peakMemoryMB, thermalState } = await withPeakMemory(() =>
      generate(PROMPTS[promptName])
    )
    runs.push({ ...value, peakMemoryMB, thermalState })
  }
  const measured = runs.slice(WARMUP_RUNS)
  // llama.rn and ExecuTorch don't count the first token, which comes from
  // the prefill
  const isFull = (run: MeasuredRun) => run.outputTokens >= MAX_OUTPUT_TOKENS - 1
  const isNominal = (run: MeasuredRun) => run.thermalState === 'nominal'
  const valid = measured.filter((run) => isFull(run) && isNominal(run))
  const stats = (pick: (run: MeasuredRun) => number | undefined) =>
    summarize(
      valid.map(pick).filter((value): value is number => value !== undefined)
    )
  const spread = {
    ttftMs: stats((run) => run.ttftMs),
    prefillTokensPerSecond: stats((run) => run.prefillTokensPerSecond),
    decodeTokensPerSecond: stats((run) => run.decodeTokensPerSecond),
    nativeTtftMs: stats((run) => run.native?.ttftMs),
    nativeDecodeTokensPerSecond: stats(
      (run) => run.native?.decodeTokensPerSecond
    ),
  }
  return {
    prompt: promptName,
    validRuns: valid.length,
    shortRuns: measured.filter((run) => !isFull(run)).length,
    throttledRuns: measured.filter((run) => !isNominal(run)).length,
    promptTokens: stats((run) => run.promptTokens)?.median,
    outputTokens: stats((run) => run.outputTokens)?.median,
    ttftMs: spread.ttftMs?.median,
    prefillTokensPerSecond: spread.prefillTokensPerSecond?.median,
    decodeTokensPerSecond: spread.decodeTokensPerSecond?.median,
    nativeTtftMs: spread.nativeTtftMs?.median,
    nativeDecodeTokensPerSecond: spread.nativeDecodeTokensPerSecond?.median,
    totalMs: stats((run) => run.totalMs)?.median,
    spread,
    // Over every run, including the warmups
    peakMemoryMB: Math.max(...runs.map((run) => run.peakMemoryMB)),
    first: runs[0],
    runs: measured,
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
  const line = `BENCHMARK ${JSON.stringify({
    runtime,
    model: MODEL_NAME,
    protocol: PROTOCOL_VERSION,
    ...result,
  })}`
  console.log(line)
  await RNBlobUtil.fs.appendFile(RESULTS_PATH, `${line}\n`, 'utf8')
}
