import NativeNcnnWrapper from './NativeNcnnWrapper'
import { type Tensor, type TensorData, toBridgeInput } from './Tensor'

export interface LoadModelResult {
  success: boolean
  modelId: number
  modelPath: string
  paramPath: string
}

export interface RunInferenceResult {
  success?: boolean
  error?: string
  output?: number[]
  inferenceTime?: number
}

export interface RunInferenceOptions {
  inputBlob?: string
  outputBlob?: string
}

/**
 * Model instance wrapping a loaded NCNN model.
 * Hides the internal model ID - use runInference on the model directly.
 */
export class Model {
  readonly #modelId: number

  constructor(modelId: number) {
    this.#modelId = modelId
  }

  get modelId(): number {
    return this.#modelId
  }

  runInference(
    input: Tensor | TensorData | number[],
    options?: RunInferenceOptions
  ): RunInferenceResult {
    const bridgeInput = toBridgeInput(input)
    return NativeNcnnWrapper.runInference(
      this.#modelId,
      bridgeInput,
      options?.inputBlob,
      options?.outputBlob
    )
  }
}
