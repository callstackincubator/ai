import type { LanguageModelV3, SpeechModelV3 } from '@ai-sdk/provider'
import { ToolSet } from 'ai'

import {
  createAppleLanguageSetupAdapter,
  createAppleSpeechSetupAdapter,
} from '../components/adapters/appleSetupAdapter'
import { createLlamaLanguageSetupAdapter } from '../components/adapters/llamaModelSetupAdapter'
import { createLlamaSpeechSetupAdapter } from '../components/adapters/llamaSpeechSetupAdapter'
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
  isAvailable: () => Promise<Availability>
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
export const languageAdapters: SetupAdapter<LanguageModelV3>[] = [
  createAppleLanguageSetupAdapter(toolDefinitions),
  createLlamaLanguageSetupAdapter(
    'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
  ),
  createLlamaLanguageSetupAdapter(
    'Qwen/Qwen2.5-3B-Instruct-GGUF/qwen2.5-3b-instruct-q3_k_m.gguf',
    toolDefinitions
  ),
]

// Available speech model adapters for text-to-speech.
export const speechAdapters: SetupAdapter<SpeechModelV3>[] = [
  createAppleSpeechSetupAdapter(),
  createLlamaSpeechSetupAdapter({
    modelId: 'OuteAI/OuteTTS-0.3-500M-GGUF/OuteTTS-0.3-500M-Q4_K_M.gguf',
    vocoderId: 'ggml-org/WavTokenizer/WavTokenizer-Large-75-Q5_1.gguf',
  }),
]
