import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface AppleEmbeddingModelInfo {
  hasAvailableAssets: boolean
  dimension: number
  languages: string[]
  maximumSequenceLength: number
  modelIdentifier: string
  revision: number
  scripts: string[]
}

/** @deprecated Use `AppleEmbeddingModelInfo` */
export type EmbeddingInfo = AppleEmbeddingModelInfo

export interface Spec extends TurboModule {
  getInfo(language: string): Promise<AppleEmbeddingModelInfo>
  prepare(language: string): Promise<void>
  generateEmbeddings(values: string[], language: string): Promise<number[][]>
}

const NativeAppleEmbeddings = TurboModuleRegistry.getEnforcing<Spec>(
  'NativeAppleEmbeddings'
)

export default {
  // Named like the language and transcription models' getModelInfo
  getModelInfo: (language: string) => NativeAppleEmbeddings.getInfo(language),
  /** @deprecated Use `getModelInfo` */
  getInfo: (language: string) => NativeAppleEmbeddings.getInfo(language),
  prepare: (language: string) => NativeAppleEmbeddings.prepare(language),
  generateEmbeddings: (values: string[], language: string) =>
    NativeAppleEmbeddings.generateEmbeddings(values, language),
}
