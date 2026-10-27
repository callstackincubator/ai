// Turns the BENCHMARK lines of benchmark logs into Markdown tables. A
// configuration measured in several launches shows the median of the
// launches, with the range of decode speeds and the number of launches.
// Generation runs that started or ended with the device throttled (thermal
// state other than nominal) are left out, unless --all is passed
//
//   bun harness/benchmarks/collect.ts [--all] <log>...

import { readFileSync } from 'node:fs'

type Result = Record<string, number | string> & {
  runtime: string
  stage: 'load' | 'cold-start' | 'generate'
}

type DeviceState = { thermalState: string; lowPowerMode: boolean }

const args = process.argv.slice(2)
const includeThrottled = args.includes('--all')

function isThrottled(result: Result) {
  const { before, after } = result as unknown as {
    before?: DeviceState
    after?: DeviceState
  }
  return [before, after].some(
    (state) => state && state.thermalState !== 'nominal'
  )
}

const launches: Result[] = args
  .filter((arg) => arg !== '--all')
  .flatMap((file) => readFileSync(file, 'utf8').split('\n'))
  .map((line) => line.match(/BENCHMARK (\{.*\})/)?.[1])
  .filter((json): json is string => Boolean(json))
  .map((json) => JSON.parse(json))
  .filter((result) => includeThrottled || !isThrottled(result))

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

// One result per configuration, stage and prompt: the median of each number
// over its launches
const groups = new Map<string, Result[]>()
for (const launch of launches) {
  const key = `${launch.runtime}|${launch.stage}|${launch.prompt ?? ''}`
  groups.set(key, [...(groups.get(key) ?? []), launch])
}
const results: Result[] = [...groups.values()].map((group) => {
  const result: Record<string, unknown> = { ...group.at(-1)!, launches: group }
  for (const [key, value] of Object.entries(group[0]!)) {
    const values = group.map((launch) => launch[key])
    if (
      typeof value === 'number' &&
      values.every((v) => typeof v === 'number')
    ) {
      result[key] = median(values as number[])
    }
  }
  const firsts = group
    .map((launch) => (launch.first as unknown as { ttftMs?: number })?.ttftMs)
    .filter((ttft): ttft is number => typeof ttft === 'number')
  result.first = firsts.length ? { ttftMs: median(firsts) } : undefined
  return result as Result
})

// The median decode speed, with the range over launches when there are several
function decode(result: Result) {
  const group = result.launches as unknown as Result[]
  const speeds = group.map((launch) => Number(launch.decodeTokensPerSecond))
  const value = format(result.decodeTokensPerSecond, 1)
  return speeds.length > 1
    ? `${value} (${format(Math.min(...speeds), 1)}–${format(Math.max(...speeds), 1)})`
    : value
}

// The peak footprint above the app's footprint before the model loaded, which
// is about 200 MB for the example app and 10 MB for the MLX app
function peakAboveBaseline(result: Result) {
  const load = results.find(
    (other) => other.runtime === result.runtime && other.stage === 'load'
  )
  return Number(result.peakMemoryMB) - Number(load?.baselineMB)
}

function launchCount(result: Result) {
  return String((result.launches as unknown as Result[]).length)
}

const format = (value: unknown, digits = 0) =>
  typeof value === 'number' ? value.toFixed(digits) : '–'

// The thermal states seen before and after the runs of every launch, flagged
// when Low Power Mode was on
function thermalState(result: Result) {
  const states = (result.launches as unknown as Result[]).flatMap((launch) => {
    const { before, after } = launch as unknown as {
      before?: DeviceState
      after?: DeviceState
    }
    return before && after ? [before, after] : []
  })
  if (!states.length) return '–'
  const names = [...new Set(states.map((state) => state.thermalState))]
  const lowPower = states.some((state) => state.lowPowerMode)
  return `${names.join(', ')}${lowPower ? ' (Low Power Mode)' : ''}`
}

function table(header: string[], rows: string[][]) {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

// The first token after a load, from the warmup run of the short prompt, for
// runtimes that don't time it separately
function firstShortRunTtft(runtime: string) {
  const short = results.find(
    (result) =>
      result.runtime === runtime &&
      result.stage === 'generate' &&
      result.prompt === 'short'
  ) as unknown as { first?: { ttftMs: number } } | undefined
  return short?.first?.ttftMs
}

const loads = results.filter((result) => result.stage === 'load')
console.log(
  table(
    [
      'Runtime',
      'First load in a process (ms)',
      'Warm load (ms)',
      'First token after load (ms)',
      'App baseline (MB)',
      'Context',
    ],
    loads.map((result) => [
      result.runtime,
      format(result.coldLoadMs),
      format(result.warmLoadMs),
      format(result.warmFirstTokenMs ?? firstShortRunTtft(result.runtime)),
      format(result.baselineMB),
      format(result.contextLength),
    ])
  )
)
console.log()

const coldStarts = results.filter((result) => result.stage === 'cold-start')
if (coldStarts.length) {
  console.log('Core AI cold start\n')
  console.log(
    table(
      [
        'Runtime',
        'Cold load (ms)',
        'Cold first token (ms)',
        'Specialize (ms)',
        'Load after specialize (ms)',
        'First token after specialize (ms)',
      ],
      coldStarts.map((result) => [
        result.runtime,
        format(result.coldLoadMs),
        format(result.coldFirstTokenMs),
        format(result.specializeMs),
        format(result.firstLoadAfterSpecializeMs),
        format(result.firstTokenAfterSpecializeMs),
      ])
    )
  )
  console.log()
}

for (const prompt of ['short', 'long']) {
  const generations = results.filter(
    (result) => result.stage === 'generate' && result.prompt === prompt
  )
  console.log(`${prompt} prompt\n`)
  console.log(
    table(
      [
        'Runtime',
        'Launches',
        'Prompt tokens',
        'Output tokens',
        'TTFT (ms)',
        'First run TTFT (ms)',
        'Prefill (tok/s)',
        'Decode (tok/s)',
        'Peak footprint (MB)',
        'Peak above app baseline (MB)',
        'Thermal state',
      ],
      generations.map((result) => [
        result.runtime,
        launchCount(result),
        format(result.promptTokens),
        format(result.outputTokens),
        format(result.ttftMs),
        format((result.first as unknown as { ttftMs?: number })?.ttftMs),
        format(result.prefillTokensPerSecond),
        decode(result),
        format(result.peakMemoryMB),
        format(peakAboveBaseline(result)),
        thermalState(result),
      ])
    )
  )
  console.log()
}
