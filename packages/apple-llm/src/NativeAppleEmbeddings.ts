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

export interface Spec extends TurboModule {
  getModelInfo(language: string): Promise<AppleEmbeddingModelInfo>
  prepare(language: string): Promise<void>
  generateEmbeddings(values: string[], language: string): Promise<number[][]>
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeAppleEmbeddings')
