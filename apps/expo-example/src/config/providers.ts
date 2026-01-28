import type { LanguageModelV3, SpeechModelV3 } from '@ai-sdk/provider'
import { ToolSet } from 'ai'

import {
  createAppleLanguageSetupAdapter,
  createAppleSpeechSetupAdapter,
} from '../components/adapters/appleSetupAdapter'
import { createLlamaLanguageSetupAdapter } from '../components/adapters/llamaModelSetupAdapter'
import { createLlamaSpeechSetupAdapter } from '../components/adapters/llamaSpeechSetupAdapter'
import { codeInterpreter, imageGeneration, webSearch } from '../tools'

export type Availability = 'yes' | 'no' | 'availableForDownload'

export interface SetupAdapter<TModel> {
  model: TModel
  tools?: ToolSet
  label: string
  isAvailable: () => Promise<Availability>
  download: (onProgress: (percentage: number) => void) => Promise<void>
  delete: () => Promise<void>
  unload: () => Promise<void>
  prepare: () => Promise<void>
}

const defaultTools = {
  webSearch,
  codeInterpreter,
  imageGeneration,
}

export const toolDefinitions = defaultTools

export const languageAdapters: SetupAdapter<LanguageModelV3>[] = [
  createAppleLanguageSetupAdapter(defaultTools),
  createLlamaLanguageSetupAdapter(
    'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
  ),
  createLlamaLanguageSetupAdapter(
    'Qwen/Qwen2.5-3B-Instruct-GGUF/qwen2.5-3b-instruct-q3_k_m.gguf',
    defaultTools
  ),
]

export const speechAdapters: SetupAdapter<SpeechModelV3>[] = [
  createAppleSpeechSetupAdapter(),
  createLlamaSpeechSetupAdapter({
    modelId: 'OuteAI/OuteTTS-0.3-500M-GGUF/OuteTTS-0.3-500M-Q4_K_M.gguf',
    vocoderId: 'ggml-org/WavTokenizer/WavTokenizer-Large-75-Q5_1.gguf',
  }),
]
