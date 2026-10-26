import type { CoreAITensor, CoreAITensorDataType } from './types'

type TypedArrayFor<T extends CoreAITensorDataType> = T extends 'float32'
  ? Float32Array
  : T extends 'float64'
    ? Float64Array
    : T extends 'int8'
      ? Int8Array
      : T extends 'int16'
        ? Int16Array
        : T extends 'int32'
          ? Int32Array
          : T extends 'int64'
            ? BigInt64Array
            : T extends 'uint16' | 'float16' | 'bfloat16'
              ? Uint16Array
              : T extends 'uint32'
                ? Uint32Array
                : T extends 'uint64'
                  ? BigUint64Array
                  : Uint8Array

const typedArrays = {
  float32: Float32Array,
  float64: Float64Array,
  int8: Int8Array,
  int16: Int16Array,
  int32: Int32Array,
  int64: BigInt64Array,
  uint8: Uint8Array,
  uint16: Uint16Array,
  uint32: Uint32Array,
  uint64: BigUint64Array,
  bool: Uint8Array,
  // Bits of each element, since there is no Float16Array in Hermes
  float16: Uint16Array,
  bfloat16: Uint16Array,
} as const

// Creates a tensor for `CoreAI.runRawFunction` from a typed array of its
// elements in row-major order. Half-precision inputs can be given as float32,
// which the native side converts
export function createTensor<T extends CoreAITensorDataType>(
  dataType: T,
  shape: number[],
  elements: TypedArrayFor<T> | ArrayLike<number>
): CoreAITensor {
  const count = shape.reduce((product, size) => product * size, 1)
  let tensorType: CoreAITensorDataType = dataType
  let array: ArrayBufferView & { length: number }
  if (ArrayBuffer.isView(elements)) {
    array = elements as ArrayBufferView & { length: number }
  } else if (dataType === 'float16' || dataType === 'bfloat16') {
    // Numbers are not the bits of half-precision elements, so they are sent
    // as float32 for the native side to convert
    array = Float32Array.from(elements)
    tensorType = 'float32'
  } else if (dataType === 'int64' || dataType === 'uint64') {
    const values = Array.from(elements, (value) => BigInt(Math.trunc(value)))
    array =
      dataType === 'int64'
        ? BigInt64Array.from(values)
        : BigUint64Array.from(values)
  } else {
    array = new (typedArrays[dataType] as any)(Array.from(elements))
  }
  if (array.length !== count) {
    throw new Error(
      `A ${dataType} tensor of shape [${shape.join(', ')}] has ${count} elements, got ${array.length}.`
    )
  }
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
  return { dataType: tensorType, shape, data: bytesToBase64(bytes) }
}

// Reads the elements of a tensor that `CoreAI.runRawFunction` returned, in
// row-major order
export function readTensor<T extends CoreAITensorDataType>(
  tensor: CoreAITensor & { dataType: T }
): TypedArrayFor<T> {
  const bytes = base64ToBytes(tensor.data)
  const TypedArray = typedArrays[tensor.dataType] as any
  // Copied, so the elements are aligned for the typed array
  const buffer = bytes.slice().buffer
  return new TypedArray(buffer)
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
