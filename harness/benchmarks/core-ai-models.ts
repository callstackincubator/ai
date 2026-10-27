// Qwen3 0.6B exported for iOS with the coreai-models recipe: static shapes,
// mixed 4-bit and 8-bit palettization. Core AI runs static-shape language
// models on the Neural Engine
export const CORE_AI_MODEL = {
  id: 'qwen3-0.6b',
  repo: 'grabbou/qwen3-0.6b-CoreAI',
  folder: 'ios',
  contextLength: 4096,
}

// Qwen3 0.6B exported for macOS with the coreai-models recipe: dynamic shapes,
// 4-bit, the size of MLX's 4-bit weights. Core AI runs dynamic-shape language
// models on the GPU
export const CORE_AI_GPU_MODEL = {
  id: 'qwen3-0.6b-dynamic',
  repo: 'mlboydaisuke/qwen3-0.6b-CoreAI-official',
  folder: 'macos',
  contextLength: 8192,
}
