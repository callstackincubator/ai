/**
 * Tensor abstraction for NCNN inference.
 * Supports mutable data (Float32Array/ArrayBuffer) for zero-copy and in-place modification.
 * Compatible with react-native-nitro-image's toRawPixelData() ArrayBuffer output.
 */
export type TensorData = Float32Array | ArrayBuffer | number[]

export interface Tensor {
  /** Mutable data - use Float32Array for in-place edits without reallocation */
  data: Float32Array | number[]
  /** Dimensions, e.g. [batch, channels, height, width] */
  shape: number[]
}

/**
 * Computes total element count from shape.
 */
export function tensorSize(shape: number[]): number {
  return shape.reduce((acc, dim) => acc * dim, 1)
}

/**
 * Creates a Tensor from mutable data. No copy - wraps the buffer.
 * Use Float32Array for zero-copy from NitroImage: `image.toRawPixelData()` returns ArrayBuffer,
 * wrap with `new Float32Array(buffer)` (note: pixel data is typically Uint8 RGB, not float).
 */
export function createTensor(data: TensorData, shape: number[]): Tensor {
  const size = tensorSize(shape)
  const arr = toFloat32Array(data)
  if (arr.length !== size) {
    throw new Error(
      `Tensor shape ${shape.join('x')} expects ${size} elements, got ${arr.length}`
    )
  }
  return { data: arr, shape }
}

/**
 * Allocates a new mutable tensor of given shape. Data can be modified in-place.
 */
export function allocateTensor(shape: number[]): Tensor {
  const size = tensorSize(shape)
  return { data: new Float32Array(size), shape }
}

function toFloat32Array(input: TensorData): Float32Array {
  if (input instanceof Float32Array) return input
  if (input instanceof ArrayBuffer) return new Float32Array(input)
  return new Float32Array(input)
}

/**
 * Converts input to format for native bridge.
 * Returns ArrayBuffer for zero-copy when possible (NitroImage, Float32Array.buffer).
 */
export function toBridgeInput(
  input: Tensor | TensorData | number[]
): ArrayBufferLike | Float32Array | number[] {
  if (Array.isArray(input)) return input
  if (input instanceof ArrayBuffer) return input
  if (input instanceof Float32Array) return input.buffer
  if (typeof input === 'object' && 'data' in input) {
    const d = (input as Tensor).data
    return d instanceof Float32Array ? d.buffer : d
  }
  return input
}

/**
 * Wraps flat output into a Tensor when shape is known.
 */
export function fromFlatArray(
  data: number[] | Float32Array,
  shape: number[]
): Tensor {
  const arr = data instanceof Float32Array ? data : new Float32Array(data)
  return createTensor(arr, shape)
}

/**
 * Create Tensor from ArrayBuffer already in float32 layout.
 * For NitroImage RGB bytes, use rgbBytesToFloatTensor() instead.
 */
export function fromArrayBuffer(buffer: ArrayBuffer, shape: number[]): Tensor {
  return createTensor(buffer, shape)
}

/**
 * Converts NitroImage RGB byte ArrayBuffer to normalized float tensor [0,1].
 * Shape: [1, height, width, 3] or [height, width, 3]. Mutates output in-place.
 */
export function rgbBytesToFloatTensor(
  rgbBuffer: ArrayBuffer,
  shape: [number, number, number] | [number, number, number, number]
): Tensor {
  const size = tensorSize(shape)
  const out = new Float32Array(size)
  const bytes = new Uint8Array(rgbBuffer)
  for (let i = 0; i < size; i++) {
    out[i] = bytes[i]! / 255
  }
  return { data: out, shape: [...shape] }
}
