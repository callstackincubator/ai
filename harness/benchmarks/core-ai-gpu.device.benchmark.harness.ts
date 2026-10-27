import { benchmarkCoreAI } from './core-ai'

// Qwen3 0.6B exported for macOS with the coreai-models recipe: dynamic shapes,
// 4-bit, the size of MLX's 4-bit weights. Core AI runs dynamic-shape language
// models on the GPU
benchmarkCoreAI('core-ai-gpu', {
  id: 'qwen3-0.6b-dynamic',
  repo: 'mlboydaisuke/qwen3-0.6b-CoreAI-official',
  folder: 'macos',
  contextLength: 8192,
})
