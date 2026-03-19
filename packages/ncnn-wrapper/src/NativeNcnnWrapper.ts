import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface Spec extends TurboModule {
  loadModel(
    paramPath: string,
    binPath: string
  ): {
    success: boolean
    modelId: number
    paramPath: string
    binPath: string
  }

  runInference(
    modelId: number,
    input: ArrayBufferLike | Float32Array | number[],
    inputBlob?: string,
    outputBlob?: string
  ): {
    success?: boolean
    error?: string
    output?: number[]
    inferenceTime?: number
  }

  getLoadedModelIDs(): number[]

  getModelInfo(): {
    loadedCount: number
    backend: string
    version: string
  }
}

export default TurboModuleRegistry.getEnforcing<Spec>('NcnnWrapperModule')
