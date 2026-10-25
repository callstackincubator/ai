import {
  downloadModel,
  llama,
  type LlamaLanguageModel,
} from '@react-native-ai/llama'
import { tool } from 'ai'
import { afterAll, beforeAll } from 'react-native-harness'
import { z } from 'zod'

// Vision, reasoning and tool calling, as in the example app
const MODEL_ID = 'bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf'
const PROJECTOR_ID =
  'bartowski/Qwen_Qwen3.5-2B-GGUF/mmproj-Qwen_Qwen3.5-2B-f16.gguf'

// Loads the language model before the tests of a file and unloads it after.
// Models already on the device are not downloaded again
export function setupLanguageModel() {
  let model: LlamaLanguageModel | undefined

  beforeAll(async () => {
    const [modelPath, projectorPath] = await Promise.all([
      downloadModel(MODEL_ID),
      downloadModel(PROJECTOR_ID),
    ])
    model = llama.languageModel(modelPath, { projectorPath })
  })

  afterAll(async () => {
    await model?.unload()
  })

  return () => model!
}

export function createTools() {
  const calls: { name: string; input: unknown }[] = []
  const tools = {
    getWeather: tool({
      description: 'Get the current weather in a city.',
      inputSchema: z.object({ city: z.string() }),
      execute: async (input) => {
        calls.push({ name: 'getWeather', input })
        return `Weather in ${input.city}: sunny`
      },
    }),
    getCurrentTime: tool({
      description: 'Get the current time.',
      inputSchema: z.object({}),
      execute: async (input) => {
        calls.push({ name: 'getCurrentTime', input })
        return '10:42'
      },
    }),
  }
  return { calls, tools }
}
