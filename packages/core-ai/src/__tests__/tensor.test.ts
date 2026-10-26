import { describe, expect, test } from 'bun:test'

import { createTensor, readTensor } from '../tensor'

describe('core ai tensors', () => {
  test('round-trips float32 elements', () => {
    const tensor = createTensor('float32', [2, 2], [0.5, -1, 2, 3.25])

    expect(tensor.dataType).toBe('float32')
    expect(tensor.shape).toEqual([2, 2])
    expect(Array.from(readTensor(tensor))).toEqual([0.5, -1, 2, 3.25])
  })

  test('encodes elements little-endian', () => {
    const tensor = createTensor('int32', [1], new Int32Array([1]))

    expect(atob(tensor.data)).toBe('\x01\x00\x00\x00')
  })

  test('reads 64-bit integers as bigints', () => {
    const tensor = createTensor('int64', [2], new BigInt64Array([1n, -2n]))

    expect(Array.from(readTensor(tensor))).toEqual([1n, -2n])
  })

  test('encodes only the viewed part of a typed array', () => {
    const elements = new Float32Array([1, 2, 3, 4]).subarray(1, 3)

    expect(
      Array.from(readTensor(createTensor('float32', [2], elements)))
    ).toEqual([2, 3])
  })

  test('rejects elements that do not fill the shape', () => {
    expect(() => createTensor('float32', [2, 3], [1, 2])).toThrow(
      'has 6 elements, got 2'
    )
  })
})
