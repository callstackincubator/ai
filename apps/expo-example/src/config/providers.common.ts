import type { LanguageModelV3, SpeechModelV3 } from '@ai-sdk/provider'

import { createLlamaLanguageSetupAdapter } from '../components/adapters/llamaModelSetupAdapter'
import { createLlamaSpeechSetupAdapter } from '../components/adapters/llamaSpeechSetupAdapter'
import { createMLCLanguageSetupAdapter } from '../components/adapters/mlcModelSetupAdapter'
import { toolDefinitions } from '../tools'

export type Availability = 'yes' | 'no' | 'availableForDownload'

// Adapter for setting up and managing AI models with lifecycle methods.
export interface SetupAdapter<TModel> {
  // The underlying AI model instance
  model: TModel
  // Unique identifier for the model
  modelId: string
  // UI presentation info
  display: {
    // Human-readable name
    label: string
    // Theme color for UI elements
    accentColor: string
    // Icon name for visual representation
    icon: string
  }
  // Whether the model is built-in (true) or downloadable (false)
  builtIn: boolean
  // Check if model is ready, unavailable, or downloadable
  isAvailable: () => Availability | Promise<Availability>
  // Download the model with progress callback
  download: (onProgress: (percentage: number) => void) => Promise<void>
  // Remove the downloaded model from storage
  delete: () => Promise<void>
  // Unload the model from memory
  unload: () => Promise<void>
  // Load and prepare the model for inference
  prepare: () => Promise<void>
}

// Available language model adapters for text generation.
export const commonLanguageAdapters: SetupAdapter<LanguageModelV3>[] = [
  createLlamaLanguageSetupAdapter(
    'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
  ),
  createLlamaLanguageSetupAdapter(
    'Qwen/Qwen2.5-3B-Instruct-GGUF/qwen2.5-3b-instruct-q3_k_m.gguf',
    toolDefinitions
  ),
  createMLCLanguageSetupAdapter('Llama-3.2-1B-Instruct'),
  createMLCLanguageSetupAdapter('Llama-3.2-3B-Instruct'),
  createMLCLanguageSetupAdapter('Phi-3.5-mini-instruct'),
  createMLCLanguageSetupAdapter('Qwen2-1.5B-Instruct'),
]

// Available speech model adapters for text-to-speech.
export const commonSpeechAdapters: SetupAdapter<SpeechModelV3>[] = [
  createLlamaSpeechSetupAdapter({
    modelId: 'OuteAI/OuteTTS-0.3-500M-GGUF/OuteTTS-0.3-500M-Q4_K_M.gguf',
    vocoderId: 'ggml-org/WavTokenizer/WavTokenizer-Large-75-Q5_1.gguf',
  }),
]
