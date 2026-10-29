import { benchmarkCoreAIColdStart } from './core-ai'
import { coreAIExport, MODEL } from './models'

if (MODEL.coreAI) {
  benchmarkCoreAIColdStart('core-ai', coreAIExport('coreAI'))
}
benchmarkCoreAIColdStart('core-ai-gpu', coreAIExport('coreAIGpu'))
