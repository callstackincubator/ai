import {
  createLLM,
  getDeviceInfo,
  ModelRegistry,
  resolveFromManifest,
  toolResultPart,
} from 'react-native-litert-lm'

import { createProviderWithRuntime } from './provider'
import { createRuntime, type LiteRTBinding } from './runtime'
import type { LiteRTProvider } from './types'

export { LiteRTError, type LiteRTErrorCode } from './errors'
export type {
  LiteRTBackendName,
  LiteRTCallMetadata,
  LiteRTLanguageModel,
  LiteRTModelSettings,
  LiteRTPrepareOptions,
  LiteRTProgress,
  LiteRTProvider,
} from './types'

const binding: LiteRTBinding = {
  createLLM: createLLM as LiteRTBinding['createLLM'],
  getDeviceInfo,
  listKeptFiles: () =>
    ModelRegistry.listCachedFiles().map((file) => file.fileName),
  resolveFromManifest,
  toolResultPart,
}

/** Create a LiteRT-LM provider. Most apps use the default {@link litert}. */
export function createLiteRTProvider(): LiteRTProvider {
  return createProviderWithRuntime((modelId, settings) =>
    createRuntime(modelId, settings, binding)
  )
}

/** The default LiteRT-LM provider: `litert('hf://org/repo')`. */
export const litert = createLiteRTProvider()
