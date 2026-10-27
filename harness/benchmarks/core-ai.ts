import { coreAI, type CoreAILanguageModel } from '@react-native-ai/core-ai'
import { streamText } from 'ai'
import RNBlobUtil from 'react-native-blob-util'
import { describe, it } from 'react-native-harness'

import {
  CORE_AI_STORAGE_PATH,
  downloadHubFolder,
} from '../../apps/expo-example/src/utils/coreAIStorageUtils'
import {
  benchmarkPrompt,
  footprintMB,
  LOAD_RUNS,
  MAX_OUTPUT_TOKENS,
  measureStream,
  median,
  PROMPTS,
  report,
  timeMs,
  waitForCooldown,
  withPeakMemory,
} from './measure'

// Where Core AI keeps models it specialized for this device
const SPECIALIZATION_CACHE = `${RNBlobUtil.fs.dirs.CacheDir}/coreai-cache`

async function clearSpecializationCache() {
  if (await RNBlobUtil.fs.exists(SPECIALIZATION_CACHE)) {
    await RNBlobUtil.fs.unlink(SPECIALIZATION_CACHE)
  }
}

type CoreAIBenchmarkConfig = {
  id: string
  repo: string
  folder: string
  contextLength: number
}

function setup(config: CoreAIBenchmarkConfig) {
  const path = `${CORE_AI_STORAGE_PATH}/${config.id}`
  let model: CoreAILanguageModel
  return {
    get model() {
      return model
    },
    async download() {
      if (!(await RNBlobUtil.fs.exists(path))) {
        await downloadHubFolder(config.repo, config.folder, path)
      }
    },
    create() {
      model = coreAI.languageModel({
        id: config.id,
        source: { type: 'file', uri: path },
      })
      return model
    },
    // Time to the first token of a one-token generation, the first one after
    // a load
    async firstTokenMs() {
      const run = await measureStream(() =>
        streamText({
          model,
          prompt: PROMPTS.short,
          maxOutputTokens: 1,
          temperature: 0,
          reasoning: 'none',
        })
      )
      return run.ttftMs
    },
  }
}

// What a user waits for on the first launch: Core AI specializes the model
// for the device and compiles it for the Neural Engine. Each stage clears the
// specialization cache first. Separate from benchmarkCoreAI, because the
// compile heats the device
export function benchmarkCoreAIColdStart(
  runtime: string,
  config: CoreAIBenchmarkConfig
) {
  const benchmark = setup(config)

  describe(`${runtime} cold start benchmark`, () => {
    const result: Record<string, number> = {}

    it('starts cold', async () => {
      await benchmark.download()
      await waitForCooldown()
      await clearSpecializationCache()
      const model = benchmark.create()
      // Core AI finishes compiling the model on the first prediction, so the
      // first token after a cold load is part of the cold start
      result.coldLoadMs = await timeMs(() => model.prepare())
      result.coldFirstTokenMs = await benchmark.firstTokenMs()
      await model.unload()
    })

    it('specializes ahead of time', async () => {
      await waitForCooldown()
      await clearSpecializationCache()
      const model = benchmark.create()
      result.specializeMs = await timeMs(() => model.specialize())
      result.firstLoadAfterSpecializeMs = await timeMs(() => model.prepare())
      result.firstTokenAfterSpecializeMs = await benchmark.firstTokenMs()
      await model.unload()
      await report(runtime, { stage: 'cold-start', ...result })
    })
  })
}

// Loads and generation with the model specialized and compiled, as on every
// launch after the first
export function benchmarkCoreAI(
  runtime: string,
  config: CoreAIBenchmarkConfig
) {
  const benchmark = setup(config)

  describe(`${runtime} benchmark`, () => {
    it('loads', async () => {
      await benchmark.download()
      // Taken first, since Core AI keeps some memory after an unload
      const baselineMB = footprintMB()
      // Specialized and compiled before the measured loads
      await benchmark.create().prepare()
      await benchmark.firstTokenMs()
      await benchmark.model.unload()

      await waitForCooldown()
      const { value: coldLoadMs, peakMemoryMB: loadPeakMemoryMB } =
        await withPeakMemory(() => timeMs(() => benchmark.create().prepare()))
      const loadedMB = footprintMB()
      const firstTokenMs = await benchmark.firstTokenMs()
      await benchmark.model.unload()

      const warmLoadMs: number[] = []
      for (let i = 0; i < LOAD_RUNS; i++) {
        warmLoadMs.push(await timeMs(() => benchmark.create().prepare()))
        if (i < LOAD_RUNS - 1) await benchmark.model.unload()
      }

      await report(runtime, {
        stage: 'load',
        baselineMB,
        loadedMB,
        loadPeakMemoryMB,
        coldLoadMs,
        warmFirstTokenMs: firstTokenMs,
        warmLoadMs: median(warmLoadMs),
        contextLength: config.contextLength,
      })
    })

    for (const prompt of ['short', 'long'] as const) {
      it(`generates from the ${prompt} prompt`, async () => {
        const result = await benchmarkPrompt(
          (text) =>
            measureStream(() =>
              streamText({
                model: benchmark.model,
                prompt: text,
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0,
                reasoning: 'none',
              })
            ),
          prompt
        )
        await report(runtime, { stage: 'generate', ...result })
      })
    }

    it('unloads', async () => {
      await benchmark.model.unload()
    })
  })
}
