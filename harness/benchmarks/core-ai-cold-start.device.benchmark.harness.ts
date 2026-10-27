import { benchmarkCoreAIColdStart } from './core-ai'
import { CORE_AI_GPU_MODEL, CORE_AI_MODEL } from './core-ai-models'

benchmarkCoreAIColdStart('core-ai', CORE_AI_MODEL)
benchmarkCoreAIColdStart('core-ai-gpu', CORE_AI_GPU_MODEL)
