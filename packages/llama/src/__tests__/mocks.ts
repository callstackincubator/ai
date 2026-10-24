import { mock } from 'bun:test'

declare global {
  var __rnaiLlamaRnStub:
    | { initLlama: (params: unknown) => Promise<unknown> }
    | undefined
  var __rnaiBlobUtilStub: BlobUtilStub | undefined
}

export interface BlobUtilStub {
  fs: {
    dirs: { DocumentDir: string }
    exists: (path: string) => Promise<boolean>
    ls: (path: string) => Promise<string[]>
    stat: (path: string) => Promise<{ size: number | string }>
    mkdir: (path: string) => Promise<void>
    unlink: (path: string) => Promise<void>
  }
  config: (options: unknown) => {
    fetch: (
      method: string,
      url: string
    ) => {
      progress: (
        callback: (received: number, total: number) => void
      ) => Promise<{ path: () => string }>
    }
  }
}

const llamaRnStub = (globalThis.__rnaiLlamaRnStub ??= {
  initLlama: async () => ({}),
})

const blobUtilStub: BlobUtilStub = (globalThis.__rnaiBlobUtilStub ??= {
  fs: {
    dirs: { DocumentDir: '/Documents' },
    exists: async () => false,
    ls: async () => [],
    stat: async () => ({ size: 0 }),
    mkdir: async () => undefined,
    unlink: async () => undefined,
  },
  config: () => ({
    fetch: () => ({
      progress: async () => ({ path: () => '' }),
    }),
  }),
})

mock.module('llama.rn', () => ({
  initLlama: (params: unknown) => llamaRnStub.initLlama(params),
}))

mock.module('react-native-blob-util', () => ({
  default: {
    get fs() {
      return blobUtilStub.fs
    },
    config: (options: unknown) => blobUtilStub.config(options),
  },
}))

export const llamaRnStubRef = llamaRnStub

export const blobUtilStubRef = blobUtilStub

export async function readStreamParts<T>(
  stream: ReadableStream<T>
): Promise<T[]> {
  const reader = stream.getReader()
  const parts: T[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    parts.push(value)
  }
  return parts
}
