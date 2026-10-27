// Turns the BENCHMARK lines of benchmark logs into Markdown tables
//
//   bun harness/benchmarks/collect.ts <log>...

import { readFileSync } from 'node:fs'

type Result = Record<string, number | string> & {
  runtime: string
  stage: 'load' | 'generate'
}

const results: Result[] = process.argv
  .slice(2)
  .flatMap((file) => readFileSync(file, 'utf8').split('\n'))
  .map((line) => line.match(/BENCHMARK (\{.*\})/)?.[1])
  .filter((json): json is string => Boolean(json))
  .map((json) => JSON.parse(json))
  // Later runs of a configuration replace earlier ones
  .reverse()
  .filter(
    (result, index, all) =>
      all.findIndex(
        (other) =>
          other.runtime === result.runtime &&
          other.stage === result.stage &&
          other.prompt === result.prompt
      ) === index
  )
  .reverse()

const format = (value: unknown, digits = 0) =>
  typeof value === 'number' ? value.toFixed(digits) : '–'

type DeviceState = { thermalState: string; lowPowerMode: boolean }

// Before → after the runs, flagged when Low Power Mode was on
function thermalState(result: Result) {
  const { before, after } = result as unknown as {
    before?: DeviceState
    after?: DeviceState
  }
  if (!before || !after) return '–'
  const lowPower = before.lowPowerMode || after.lowPowerMode
  return `${before.thermalState} → ${after.thermalState}${lowPower ? ' (Low Power Mode)' : ''}`
}

function table(header: string[], rows: string[][]) {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

const loads = results.filter((result) => result.stage === 'load')
console.log(
  table(
    [
      'Runtime',
      'Cold load (ms)',
      'Cold first token (ms)',
      'Specialize (ms)',
      'Load after specialize (ms)',
      'First token after specialize (ms)',
      'Warm load (ms)',
      'Warm first token (ms)',
      'Footprint after load (MB)',
      'Context',
    ],
    loads.map((result) => [
      result.runtime,
      format(result.coldLoadMs),
      format(result.coldFirstTokenMs),
      format(result.specializeMs),
      format(result.firstLoadAfterSpecializeMs),
      format(result.firstTokenAfterSpecializeMs),
      format(result.warmLoadMs),
      format(result.warmFirstTokenMs),
      format(Number(result.loadedMB) - Number(result.baselineMB)),
      format(result.contextLength),
    ])
  )
)
console.log()

for (const prompt of ['short', 'long']) {
  const generations = results.filter(
    (result) => result.stage === 'generate' && result.prompt === prompt
  )
  console.log(`${prompt} prompt\n`)
  console.log(
    table(
      [
        'Runtime',
        'Prompt tokens',
        'Output tokens',
        'TTFT (ms)',
        'First run TTFT (ms)',
        'Prefill (tok/s)',
        'Decode (tok/s)',
        'Peak footprint (MB)',
        'Thermal state',
      ],
      generations.map((result) => [
        result.runtime,
        format(result.promptTokens),
        format(result.outputTokens),
        format(result.ttftMs),
        format((result.first as unknown as { ttftMs?: number })?.ttftMs),
        format(result.prefillTokensPerSecond),
        format(result.decodeTokensPerSecond, 1),
        format(result.peakMemoryMB),
        thermalState(result),
      ])
    )
  )
  console.log()
}
