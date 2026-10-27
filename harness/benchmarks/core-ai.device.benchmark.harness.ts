import { benchmarkCoreAI } from './core-ai'

// Qwen3 0.6B exported for iOS with the coreai-models recipe: static shapes,
// mixed 4-bit and 8-bit palettization. Core AI runs static-shape language
// models on the Neural Engine
benchmarkCoreAI('core-ai', {
  id: 'qwen3-0.6b',
  repo: 'grabbou/qwen3-0.6b-CoreAI',
  folder: 'ios',
  contextLength: 4096,
})
