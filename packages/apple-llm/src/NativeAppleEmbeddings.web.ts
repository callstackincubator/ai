import type { TurboModule } from 'react-native'

import { unsupportedAsync } from './unsupportedPlatform'

export interface EmbeddingInfo {
  hasAvailableAssets: boolean
  dimension: number
  languages: string[]
  maximumSequenceLength: number
  modelIdentifier: string
  revision: number
  scripts: string[]
}

export interface Spec extends TurboModule {
  getInfo(language: string): Promise<EmbeddingInfo>
  prepare(language: string): Promise<void>
  generateEmbeddings(values: string[], language: string): Promise<number[][]>
}

export default {
  getInfo: () => unsupportedAsync('Apple embeddings'),
  prepare: () => unsupportedAsync('Apple embeddings'),
  generateEmbeddings: () => unsupportedAsync('Apple embeddings'),
} satisfies Spec
