import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface Spec extends TurboModule {
  prepare(language: string): Promise<void>
  generateEmbeddings(values: string[], language: string): Promise<number[][]>
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeAppleEmbeddings')
