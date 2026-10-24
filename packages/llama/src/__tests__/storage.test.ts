import { describe, expect, test } from 'bun:test'

import { blobUtilStubRef } from './mocks'

const { getModelPath, isModelDownloaded, parseModelId, removeModel } =
  await import('../storage')

describe('parseModelId', () => {
  test('splits owner/repo/filename ids', () => {
    expect(parseModelId('ggml-org/models/llama-3.2-1b.gguf')).toEqual({
      repo: 'ggml-org/models',
      filename: 'llama-3.2-1b.gguf',
    })
  })

  test('supports exactly three segments', () => {
    expect(parseModelId('owner/repo/model.gguf')).toEqual({
      repo: 'owner/repo',
      filename: 'model.gguf',
    })
  })

  test('rejects ids with too few segments', () => {
    expect(() => parseModelId('owner/repo')).toThrow(
      'Invalid model ID format: "owner/repo"'
    )
    expect(() => parseModelId('model.gguf')).toThrow('Expected format')
  })
})

describe('getModelPath', () => {
  test('uses the filename inside the models directory', () => {
    expect(getModelPath('owner/repo/model.gguf')).toBe(
      '/Documents/llama-models/model.gguf'
    )
  })
})

describe('isModelDownloaded', () => {
  test('checks the resolved path', async () => {
    const checked: string[] = []
    blobUtilStubRef.fs.exists = async (path) => {
      checked.push(path)
      return path === '/Documents/llama-models/model.gguf'
    }

    expect(await isModelDownloaded('owner/repo/model.gguf')).toBe(true)
    expect(checked).toEqual(['/Documents/llama-models/model.gguf'])
  })
})

describe('removeModel', () => {
  test('unlinks existing files only', async () => {
    const unlinked: string[] = []
    blobUtilStubRef.fs.exists = async () => true
    blobUtilStubRef.fs.unlink = async (path) => {
      unlinked.push(path)
    }

    await removeModel('owner/repo/model.gguf')
    expect(unlinked).toEqual(['/Documents/llama-models/model.gguf'])

    blobUtilStubRef.fs.exists = async () => false
    await removeModel('owner/repo/model.gguf')
    expect(unlinked).toHaveLength(1)
  })
})
