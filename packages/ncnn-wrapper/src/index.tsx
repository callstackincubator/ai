import { Model } from './Model'
import NativeNcnnWrapper from './NativeNcnnWrapper'
import { type Tensor, type TensorData } from './Tensor'

export const NcnnWrapper = NativeNcnnWrapper

export {
  type LoadModelResult,
  Model,
  type RunInferenceOptions,
  type RunInferenceResult,
} from './Model'
export type { Tensor, TensorData } from './Tensor'
export {
  allocateTensor,
  createTensor,
  fromArrayBuffer,
  fromFlatArray,
  rgbBytesToFloatTensor,
  tensorSize,
  toBridgeInput,
} from './Tensor'

export function loadModel(paramPath: string, binPath: string) {
  const result = NativeNcnnWrapper.loadModel(paramPath, binPath)
  return result.success ? new Model(result.modelId) : null
}

export function getLoadedModels(): Model[] {
  return NativeNcnnWrapper.getLoadedModelIDs().map((id) => new Model(id))
}

export function runInference(
  model: Model,
  input: Tensor | TensorData | number[]
) {
  return model.runInference(input)
}

export function getModelInfo() {
  return NativeNcnnWrapper.getModelInfo()
}
