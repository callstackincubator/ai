import { describe, expect, test } from 'bun:test'

import {
  AppleLLMErrorCodes,
  createAppleLLMError,
  isAppleLLMErrorCode,
} from '../errors'

describe('isAppleLLMErrorCode', () => {
  test('accepts every known error code', () => {
    for (const code of Object.values(AppleLLMErrorCodes)) {
      expect(isAppleLLMErrorCode(code)).toBe(true)
    }
  })

  test('rejects unknown strings and non-strings', () => {
    expect(isAppleLLMErrorCode('SOMETHING_ELSE')).toBe(false)
    expect(isAppleLLMErrorCode('')).toBe(false)
    expect(isAppleLLMErrorCode(undefined)).toBe(false)
    expect(isAppleLLMErrorCode(null)).toBe(false)
    expect(isAppleLLMErrorCode(7)).toBe(false)
    expect(isAppleLLMErrorCode({ code: 'GENERATION_ERROR' })).toBe(false)
  })
})

describe('createAppleLLMError', () => {
  test('creates an Error carrying the code', () => {
    const error = createAppleLLMError(
      'model is busy',
      AppleLLMErrorCodes.GenerationError
    )

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('model is busy')
    expect(error.code).toBe(AppleLLMErrorCodes.GenerationError)
  })
})
