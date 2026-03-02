import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

export interface Spec extends TurboModule {
  loadModel(
    modelPath: string,
    paramPath: string
  ): {
    success: boolean
    modelId: number
    modelPath: string
    paramPath: string
  }

  runInference(
    modelId: number,
    input: ArrayBufferLike | Float32Array | number[]
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
