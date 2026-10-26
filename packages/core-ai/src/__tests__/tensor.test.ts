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

  test('sends half-precision numbers as float32 for the native side to convert', () => {
    const tensor = createTensor('float16', [2], [0.5, -1])

    expect(tensor.dataType).toBe('float32')
    expect(
      Array.from(readTensor(tensor as typeof tensor & { dataType: 'float32' }))
    ).toEqual([0.5, -1])
  })

  test('keeps half-precision bits given as a Uint16Array', () => {
    const tensor = createTensor('float16', [1], new Uint16Array([0x3800]))

    expect(tensor.dataType).toBe('float16')
    expect(atob(tensor.data)).toBe('\x00\x38')
  })

  test('creates 64-bit integers from numbers', () => {
    const tensor = createTensor('int64', [2], [1, -2])

    expect(
      Array.from(readTensor(tensor as typeof tensor & { dataType: 'int64' }))
    ).toEqual([1n, -2n])
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
