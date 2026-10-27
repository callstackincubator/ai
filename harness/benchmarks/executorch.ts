import RNBlobUtil from 'react-native-blob-util'
import { llm, wrapAsync } from 'react-native-executorch'
import { describe, it } from 'react-native-harness'

import {
  benchmarkPrompt,
  footprintMB,
  LOAD_RUNS,
  MAX_OUTPUT_TOKENS,
  median,
  report,
  timeMs,
  toRun,
  waitForCooldown,
  withPeakMemory,
} from './measure'

// Models from the react-native-executorch model zoo
const BASE_URL =
  'https://huggingface.co/software-mansion/react-native-executorch-qwen-3/resolve/v0.10.0'
const STORAGE_PATH = `${RNBlobUtil.fs.dirs.DocumentDir}/executorch`

async function download(file: string) {
  const path = `${STORAGE_PATH}/${file.replaceAll('/', '_')}`
  if (!(await RNBlobUtil.fs.exists(path))) {
    await RNBlobUtil.config({ path: `${path}.partial` }).fetch(
      'GET',
      `${BASE_URL}/${file}`
    )
    await RNBlobUtil.fs.mv(`${path}.partial`, path)
  }
  return path
}

// The runner takes a rendered prompt. This is Qwen3's chat template with
// thinking off, which the other runtimes render from the same message.
// react-native-executorch's chat session can't turn thinking off
function renderPrompt(prompt: string) {
  return `<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`
}

const createRunner = wrapAsync(llm.createLLMRunner)

// Runs on the ExecuTorch worklet thread, so the token times are taken there
function generateWorklet(runner: llm.LLMRunner, prompt: string) {
  'worklet'
  runner.reset()
  const startMs = Date.now()
  let firstTokenMs = 0
  const stats = runner.generate(
    prompt,
    { maxNewTokens: MAX_OUTPUT_TOKENS, temperature: 0 },
    () => {
      if (!firstTokenMs) firstTokenMs = Date.now()
    }
  )
  return { stats, startMs, firstTokenMs, endMs: Date.now() }
}
const generate = wrapAsync(generateWorklet)

export function benchmarkExecuTorch(
  runtime: string,
  config: { file: string; contextLength: number }
) {
  describe(`${runtime} benchmark`, () => {
    let runner: llm.LLMRunner
    let modelPath: string
    let tokenizerPath: string

    it('loads', async () => {
      ;[modelPath, tokenizerPath] = await Promise.all([
        download(config.file),
        download('tokenizer.json'),
      ])
      await waitForCooldown()
      const baselineMB = footprintMB()

      const { value: coldLoadMs, peakMemoryMB: loadPeakMemoryMB } =
        await withPeakMemory(() =>
          timeMs(async () => {
            runner = await createRunner(modelPath, tokenizerPath)
          })
        )
      const loadedMB = footprintMB()
      runner.dispose()

      const warmLoadMs: number[] = []
      for (let i = 0; i < LOAD_RUNS; i++) {
        warmLoadMs.push(
          await timeMs(async () => {
            runner = await createRunner(modelPath, tokenizerPath)
          })
        )
        if (i < LOAD_RUNS - 1) runner.dispose()
      }

      await report(runtime, {
        stage: 'load',
        baselineMB,
        loadedMB,
        loadPeakMemoryMB,
        coldLoadMs,
        warmLoadMs: median(warmLoadMs),
        contextLength:
          runner.getKVCacheState().maxSeqLen ?? config.contextLength,
      })
    })

    for (const prompt of ['short', 'long'] as const) {
      it(`generates from the ${prompt} prompt`, async () => {
        const result = await benchmarkPrompt(async (text) => {
          const { stats, ...times } = await generate(runner, renderPrompt(text))
          return toRun({
            promptTokens: stats.numPromptTokens,
            outputTokens: stats.numGeneratedTokens,
            ...times,
          })
        }, prompt)
        await report(runtime, { stage: 'generate', ...result })
      })
    }

    it('unloads', () => {
      runner.dispose()
    })
  })
}
