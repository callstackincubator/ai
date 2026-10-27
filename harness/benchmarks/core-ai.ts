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

export function benchmarkCoreAI(
  runtime: string,
  config: { id: string; repo: string; folder: string; contextLength: number }
) {
  const path = `${CORE_AI_STORAGE_PATH}/${config.id}`
  const createModel = () =>
    coreAI.languageModel({ id: config.id, source: { type: 'file', uri: path } })

  describe(`${runtime} benchmark`, () => {
    let model: CoreAILanguageModel
    const load: Record<string, number> = {}

    // Time to the first token of a one-token generation, the first one after
    // a load
    const firstTokenMs = async () =>
      (
        await measureStream(() =>
          streamText({
            model,
            prompt: PROMPTS.short,
            maxOutputTokens: 1,
            temperature: 0,
            reasoning: 'none',
          })
        )
      ).ttftMs

    it('starts cold', async () => {
      if (!(await RNBlobUtil.fs.exists(path))) {
        await downloadHubFolder(config.repo, config.folder, path)
      }
      await waitForCooldown()
      const baselineMB = footprintMB()

      // Cold: nothing specialized for this device yet. Core AI finishes
      // compiling the model on the first prediction, so the first token
      // after a cold load is part of the cold start
      await clearSpecializationCache()
      model = createModel()
      const { value: coldLoadMs, peakMemoryMB: loadPeakMemoryMB } =
        await withPeakMemory(() => timeMs(() => model.prepare()))
      const loadedMB = footprintMB()
      const coldFirstTokenMs = await firstTokenMs()
      await model.unload()
      Object.assign(load, {
        baselineMB,
        loadedMB,
        loadPeakMemoryMB,
        coldLoadMs,
        coldFirstTokenMs,
      })
    })

    it('specializes ahead of time', async () => {
      // Specializing ahead of time, then the first load and token after it
      await waitForCooldown()
      await clearSpecializationCache()
      model = createModel()
      const specializeMs = await timeMs(() => model.specialize())
      const firstLoadAfterSpecializeMs = await timeMs(() => model.prepare())
      const firstTokenAfterSpecializeMs = await firstTokenMs()
      await model.unload()
      Object.assign(load, {
        specializeMs,
        firstLoadAfterSpecializeMs,
        firstTokenAfterSpecializeMs,
      })
    })

    it('loads warm', async () => {
      // Warm: specialized and compiled
      await waitForCooldown()
      const warmLoadMs: number[] = []
      for (let i = 0; i < LOAD_RUNS; i++) {
        model = createModel()
        warmLoadMs.push(await timeMs(() => model.prepare()))
        if (i < LOAD_RUNS - 1) await model.unload()
      }
      const warmFirstTokenMs = await firstTokenMs()

      await report(runtime, {
        stage: 'load',
        ...load,
        warmLoadMs: median(warmLoadMs),
        warmFirstTokenMs,
        contextLength: config.contextLength,
      })
    })

    for (const prompt of ['short', 'long'] as const) {
      it(`generates from the ${prompt} prompt`, async () => {
        const result = await benchmarkPrompt(
          (text) =>
            measureStream(() =>
              streamText({
                model,
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
      await model.unload()
    })
  })
}
