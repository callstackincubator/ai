// Turns the BENCHMARK lines of benchmark logs into Markdown tables. A
// configuration measured in several launches pools the valid runs of every
// launch, the ones that decoded the full output and kept the device at a
// nominal thermal state, and shows their median with the interquartile range.
// Only results of the newest protocol version (PROTOCOL_VERSION in measure.ts)
// are used, since older ones were measured differently
//
//   bun harness/benchmarks/collect.ts <log>...

import { readFileSync } from 'node:fs'

type Run = {
  outputTokens: number
  ttftMs: number
  prefillTokensPerSecond?: number
  decodeTokensPerSecond: number
  thermalState: string
  native?: { ttftMs: number; decodeTokensPerSecond: number }
}

type Result = Record<string, any> & {
  runtime: string
  protocol?: number
  stage: 'load' | 'cold-start' | 'generate' | 'unload'
}

const MAX_OUTPUT_TOKENS = 256

const all: Result[] = process.argv
  .slice(2)
  .flatMap((file) => readFileSync(file, 'utf8').split('\n'))
  .map((line) => line.match(/BENCHMARK (\{.*\})/)?.[1])
  .filter((json): json is string => Boolean(json))
  .map((json) => JSON.parse(json))

const protocol = Math.max(...all.map((result) => result.protocol ?? 1))
const launches = all.filter((result) => (result.protocol ?? 1) === protocol)
if (launches.length < all.length) {
  console.error(
    `Skipped ${all.length - launches.length} results of protocols older than ${protocol}`
  )
}

function quantile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower)
}

const median = (values: number[]) =>
  values.length ? quantile(values, 0.5) : undefined

const format = (value: unknown, digits = 0) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '–'

// The median with the interquartile range
function withIqr(values: number[], digits = 0) {
  if (!values.length) return '–'
  return `${format(median(values), digits)} (${format(quantile(values, 0.25), digits)}–${format(quantile(values, 0.75), digits)})`
}

// Results before the model was recorded are of Qwen3 0.6B
const modelOf = (result: Result) => result.model ?? 'qwen3-0.6b'

// Launches of one model, configuration, stage and prompt
const groups = new Map<string, Result[]>()
for (const launch of launches) {
  const key = `${modelOf(launch)}|${launch.runtime}|${launch.stage}|${launch.prompt ?? ''}`
  groups.set(key, [...(groups.get(key) ?? []), launch])
}

// The median over launches of a number every launch reports
const launchMedian = (results: Result[], key: string) =>
  median(
    results
      .map((result) => result[key])
      .filter((value): value is number => typeof value === 'number')
  )

function table(header: string[], rows: string[][]) {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

console.log(`Protocol ${protocol}\n`)

for (const model of new Set(launches.map(modelOf))) {
  const group = (runtime: string, stage: string, prompt = '') =>
    groups.get(`${model}|${runtime}|${stage}|${prompt}`) ?? []
  const runtimes = [
    ...new Set(
      launches
        .filter((launch) => modelOf(launch) === model)
        .map((launch) => launch.runtime)
    ),
  ]

  console.log(`## ${model}\n`)
  console.log(
    table(
      [
        'Runtime',
        'Launches',
        'First load in a process (ms)',
        'Warm load (ms)',
        'First token after load (ms)',
        'App baseline (MB)',
        'Retained after unload (MB)',
        'Context',
      ],
      runtimes
        .filter((runtime) => group(runtime, 'load').length)
        .map((runtime) => {
          const loads = group(runtime, 'load')
          const firstTokenMs =
            launchMedian(loads, 'warmFirstTokenMs') ??
            median(
              group(runtime, 'generate', 'short')
                .map((launch) => launch.first?.ttftMs)
                .filter((ttft): ttft is number => typeof ttft === 'number')
            )
          return [
            runtime,
            String(loads.length),
            format(launchMedian(loads, 'coldLoadMs')),
            format(launchMedian(loads, 'warmLoadMs')),
            format(firstTokenMs),
            format(launchMedian(loads, 'baselineMB')),
            format(launchMedian(group(runtime, 'unload'), 'retainedMB')),
            format(launchMedian(loads, 'contextLength')),
          ]
        })
    )
  )
  console.log()

  const coldStarts = runtimes.filter(
    (runtime) => group(runtime, 'cold-start').length
  )
  if (coldStarts.length) {
    console.log('Core AI cold start\n')
    console.log(
      table(
        [
          'Runtime',
          'Launches',
          'Cold load (ms)',
          'Cold first token (ms)',
          'Specialize (ms)',
          'Load after specialize (ms)',
          'First token after specialize (ms)',
        ],
        coldStarts.map((runtime) => {
          const results = group(runtime, 'cold-start')
          return [
            runtime,
            String(results.length),
            format(launchMedian(results, 'coldLoadMs')),
            format(launchMedian(results, 'coldFirstTokenMs')),
            format(launchMedian(results, 'specializeMs'), 1),
            format(launchMedian(results, 'firstLoadAfterSpecializeMs')),
            format(launchMedian(results, 'firstTokenAfterSpecializeMs')),
          ]
        })
      )
    )
    console.log()
  }

  const isValid = (run: Run) =>
    run.outputTokens >= MAX_OUTPUT_TOKENS - 1 && run.thermalState === 'nominal'

  for (const prompt of ['short', 'long']) {
    console.log(`${prompt} prompt\n`)
    const rows = runtimes
      .filter((runtime) => group(runtime, 'generate', prompt).length)
      .map((runtime) => {
        const results = group(runtime, 'generate', prompt)
        const runs = results.flatMap((result) => (result.runs ?? []) as Run[])
        const valid = runs.filter(isValid)
        const pick = (fn: (run: Run) => number | undefined) =>
          valid.map(fn).filter((value): value is number => value !== undefined)
        const decode = pick((run) => run.decodeTokensPerSecond)
        const nativeDecode = pick((run) => run.native?.decodeTokensPerSecond)
        // How much slower the decode looks from JS than inside the runtime
        const overhead =
          nativeDecode.length && decode.length
            ? (1 - median(decode)! / median(nativeDecode)!) * 100
            : undefined
        const launchDecode = results
          .map((result) => result.decodeTokensPerSecond)
          .filter((value): value is number => typeof value === 'number')
        const baselineMB = launchMedian(group(runtime, 'load'), 'baselineMB')
        return [
          runtime,
          String(results.length),
          `${valid.length}/${runs.length}`,
          format(launchMedian(results, 'promptTokens')),
          withIqr(pick((run) => run.ttftMs)),
          format(median(pick((run) => run.prefillTokensPerSecond))),
          withIqr(decode, 1),
          launchDecode.length > 1
            ? `${format(Math.min(...launchDecode), 1)}–${format(Math.max(...launchDecode), 1)}`
            : '–',
          format(median(nativeDecode), 1),
          overhead === undefined ? '–' : `${format(overhead, 1)}%`,
          format(
            (launchMedian(results, 'peakMemoryMB') ?? NaN) - (baselineMB ?? NaN)
          ),
        ]
      })
    console.log(
      table(
        [
          'Runtime',
          'Launches',
          'Valid runs',
          'Prompt tokens',
          'TTFT ms (IQR)',
          'Prefill (tok/s)',
          'Decode tok/s (IQR)',
          'Launch medians',
          'Native decode (tok/s)',
          'JS overhead',
          'Peak above baseline (MB)',
        ],
        rows
      )
    )
    console.log()
  }
}
