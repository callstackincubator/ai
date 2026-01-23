export interface ModelOption {
  name: string
  modelId: string
  size: string
}

export const LLAMA_MODELS: ModelOption[] = [
  {
    name: 'SmolLM3 3B (Q4_K_M)',
    modelId: 'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf',
    size: '1.78GB',
  },
  {
    name: 'FunctionGemma 270M IT (Q4_K_M)',
    modelId:
      'unsloth/functiongemma-270m-it-GGUF/functiongemma-270m-it-Q4_K_M.gguf',
    size: '240MB',
  },
  {
    name: 'Qwen 3 4B (Q3_K_M)',
    modelId: 'Qwen/Qwen2.5-3B-Instruct-GGUF/qwen2.5-3b-instruct-q3_k_m.gguf',
    size: '1.93GB',
  },
]

export interface SpeechModelOption {
  name: string
  modelId: string
  vocoderId: string
  size: string
}

export const SPEECH_LLAMA_MODELS: SpeechModelOption[] = [
  {
    name: 'OuteTTS 0.3 500M (Q4_K_M) + WavTokenizer (Q5_1)',
    modelId: 'OuteAI/OuteTTS-0.3-500M-GGUF/OuteTTS-0.3-500M-Q4_K_M.gguf',
    vocoderId: 'ggml-org/WavTokenizer/WavTokenizer-Large-75-Q5_1.gguf',
    size: '454MB + 70MB',
  },
]
