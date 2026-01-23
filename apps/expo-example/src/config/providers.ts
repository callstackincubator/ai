import type { LanguageModelV3, SpeechModelV3 } from '@ai-sdk/provider'
import { ToolSet } from 'ai'

import {
  createAppleLanguageSetupAdapter,
  createAppleLanguageSetupWithToolsAdapter,
  createAppleSpeechSetupAdapter,
} from '../components/adapters/appleSetupAdapter'
import { createLlamaLanguageSetupAdapter } from '../components/adapters/llamaModelSetupAdapter'
import { createLlamaSpeechSetupAdapter } from '../components/adapters/llamaSpeechSetupAdapter'

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

export const languageAdapters: SetupAdapter<LanguageModelV3>[] = [
  createAppleLanguageSetupAdapter(),
  createAppleLanguageSetupWithToolsAdapter(),
  createLlamaLanguageSetupAdapter(
    'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
  ),
  createLlamaLanguageSetupAdapter(
    'unsloth/functiongemma-270m-it-GGUF/functiongemma-270m-it-Q4_K_M.gguf'
  ),
  createLlamaLanguageSetupAdapter(
    'Qwen/Qwen2.5-3B-Instruct-GGUF/qwen2.5-3b-instruct-q3_k_m.gguf'
  ),
]

export const speechAdapters: SetupAdapter<SpeechModelV3>[] = [
  createAppleSpeechSetupAdapter(),
  createLlamaSpeechSetupAdapter({
    modelId: 'OuteAI/OuteTTS-0.3-500M-GGUF/OuteTTS-0.3-500M-Q4_K_M.gguf',
    vocoderId: 'ggml-org/WavTokenizer/WavTokenizer-Large-75-Q5_1.gguf',
  }),
]
