import {
  downloadModel,
  llama,
  type LlamaLanguageModel,
} from '@react-native-ai/llama'
import { streamText } from 'ai'
import { describe, it } from 'react-native-harness'

import {
  benchmarkPrompt,
  footprintMB,
  LOAD_RUNS,
  MAX_OUTPUT_TOKENS,
  measureStream,
  median,
  memoryAfterUnload,
  report,
  timeMs,
  waitForCooldown,
  withPeakMemory,
} from './measure'
import { MODEL } from './models'

// All layers run on the GPU with Metal. The context matches the Neural Engine
// export of Qwen3 0.6B
const CONTEXT_LENGTH = 4096
const RUNTIME = 'llama.rn'

describe('llama.rn benchmark', () => {
  let model: LlamaLanguageModel
  let baselineMB: number
  const createModel = (path: string) =>
    llama.languageModel(path, {
      contextParams: { n_ctx: CONTEXT_LENGTH, n_gpu_layers: 99 },
    })

  it('loads', async () => {
    const path = await downloadModel(MODEL.llama)
    await waitForCooldown()
    baselineMB = footprintMB()

    // The first load in the process. The file may still be in the page cache
    // from an earlier run
    model = createModel(path)
    const { value: coldLoadMs, peakMemoryMB: loadPeakMemoryMB } =
      await withPeakMemory(() => timeMs(() => model.prepare()))
    const loadedMB = footprintMB()
    await model.unload()

    const warmLoadMs: number[] = []
    for (let i = 0; i < LOAD_RUNS; i++) {
      model = createModel(path)
      warmLoadMs.push(await timeMs(() => model.prepare()))
      if (i < LOAD_RUNS - 1) await model.unload()
    }

    await report(RUNTIME, {
      stage: 'load',
      baselineMB,
      loadedMB,
      loadPeakMemoryMB,
      coldLoadMs,
      warmLoadMs: median(warmLoadMs),
      contextLength: CONTEXT_LENGTH,
    })
  })

  for (const prompt of ['short', 'long'] as const) {
    it(`generates from the ${prompt} prompt`, async () => {
      const result = await benchmarkPrompt(async (text) => {
        // llama.rn reuses the KV cache of a matching prompt prefix, which
        // would skip the prefill of every run after the first
        await (await model.prepare()).clearCache()
        return measureStream(
          () =>
            streamText({
              model,
              prompt: text,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              temperature: 0,
              reasoning: 'none',
            }),
          // llama.cpp's own timings of the prefill and of the decode
          (metadata) => {
            const timings = metadata?.llama?.timings
            return (
              timings && {
                ttftMs: timings.prompt_ms,
                decodeTokensPerSecond: timings.predicted_per_second,
              }
            )
          }
        )
      }, prompt)
      await report(RUNTIME, { stage: 'generate', ...result })
    })
  }

  it('unloads', async () => {
    await model.unload()
    await report(RUNTIME, {
      stage: 'unload',
      ...(await memoryAfterUnload(baselineMB)),
    })
  })
})
