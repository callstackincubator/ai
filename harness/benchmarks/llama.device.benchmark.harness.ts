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
  report,
  timeMs,
  waitForCooldown,
  withPeakMemory,
} from './measure'

// Qwen3 0.6B in Q4_0, 4-bit with a scale per 32 weights, the GGUF closest to
// MLX's 4-bit. All layers run on the GPU with Metal. The context matches the
// Core AI export
const MODEL_ID = 'bartowski/Qwen_Qwen3-0.6B-GGUF/Qwen_Qwen3-0.6B-Q4_0.gguf'
const CONTEXT_LENGTH = 4096
const RUNTIME = 'llama.rn'

describe('llama.rn benchmark', () => {
  let model: LlamaLanguageModel
  const createModel = (path: string) =>
    llama.languageModel(path, {
      contextParams: { n_ctx: CONTEXT_LENGTH, n_gpu_layers: 99 },
    })

  it('loads', async () => {
    const path = await downloadModel(MODEL_ID)
    await waitForCooldown()
    const baselineMB = footprintMB()

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
        return measureStream(() =>
          streamText({
            model,
            prompt: text,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            temperature: 0,
            reasoning: 'none',
          })
        )
      }, prompt)
      await report(RUNTIME, { stage: 'generate', ...result })
    })
  }

  it('unloads', async () => {
    await model.unload()
  })
})
