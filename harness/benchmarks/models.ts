// The models the runtimes are benchmarked with. Each runtime gets the export
// of the model closest to 4-bit weights. The model is picked with
// EXPO_PUBLIC_BENCHMARK_MODEL when the bundle is built (run.sh sets it from
// MODEL)

export type CoreAIExport = {
  id: string
  repo: string
  folder: string
  contextLength: number
}

type BenchmarkModel = {
  // Static shapes, which Core AI runs on the Neural Engine
  coreAI?: CoreAIExport
  // Dynamic shapes, which Core AI runs on the GPU
  coreAIGpu: CoreAIExport
  // A GGUF on Hugging Face, as repo/file
  llama: string
  // .pte files in react-native-executorch-qwen-3
  executorch: { mlx: string; xnnpack: string; contextLength: number }
}

export const MODELS = {
  'qwen3-0.6b': {
    // The coreai-models iOS recipe: mixed 4-bit and 8-bit palettization
    coreAI: {
      id: 'qwen3-0.6b',
      repo: 'grabbou/qwen3-0.6b-CoreAI',
      folder: 'ios',
      contextLength: 4096,
    },
    // The coreai-models macOS recipe: 4-bit, the size of MLX's 4-bit weights
    coreAIGpu: {
      id: 'qwen3-0.6b-dynamic',
      repo: 'mlboydaisuke/qwen3-0.6b-CoreAI-official',
      folder: 'macos',
      contextLength: 8192,
    },
    // Q4_0: 4-bit with a scale per 32 weights, the GGUF closest to MLX's
    // 4-bit
    llama: 'bartowski/Qwen_Qwen3-0.6B-GGUF/Qwen_Qwen3-0.6B-Q4_0.gguf',
    // int4 weights for MLX, and 8-bit dynamic activations with 4-bit weights
    // (8da4w) for XNNPACK
    executorch: {
      mlx: '0_6b/mlx/qwen_3_0_6b_mlx_int4.pte',
      xnnpack: '0_6b/xnnpack/qwen_3_0_6b_xnnpack_8da4w.pte',
      contextLength: 2048,
    },
  },
  'qwen3-1.7b': {
    // No Neural Engine export: at this size the static export loads but
    // fails to run on iOS 27, its model card says
    coreAIGpu: {
      id: 'qwen3-1.7b-dynamic',
      repo: 'mlboydaisuke/qwen3-1.7b-CoreAI-official',
      folder: 'ios-gpu',
      contextLength: 40960,
    },
    llama: 'bartowski/Qwen_Qwen3-1.7B-GGUF/Qwen_Qwen3-1.7B-Q4_0.gguf',
    executorch: {
      mlx: '1_7b/mlx/qwen_3_1_7b_mlx_int4.pte',
      xnnpack: '1_7b/xnnpack/qwen_3_1_7b_xnnpack_8da4w.pte',
      contextLength: 2048,
    },
  },
} satisfies Record<string, BenchmarkModel>

export const MODEL_NAME = (process.env.EXPO_PUBLIC_BENCHMARK_MODEL ??
  'qwen3-0.6b') as keyof typeof MODELS

export const MODEL: BenchmarkModel = MODELS[MODEL_NAME]
if (!MODEL) {
  throw new Error(`Unknown benchmark model ${MODEL_NAME}`)
}

export function coreAIExport(key: 'coreAI' | 'coreAIGpu') {
  const coreAIModel = MODEL[key]
  if (!coreAIModel) {
    throw new Error(`${MODEL_NAME} has no ${key} export`)
  }
  return coreAIModel
}
