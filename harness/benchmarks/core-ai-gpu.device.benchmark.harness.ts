import { benchmarkCoreAI } from './core-ai'
import { coreAIExport } from './models'

benchmarkCoreAI('core-ai-gpu', coreAIExport('coreAIGpu'))
