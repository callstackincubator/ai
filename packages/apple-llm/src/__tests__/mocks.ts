import { mock } from 'bun:test'

declare global {
  var __rnaiTurboStubs: Record<string, Record<string, unknown>> | undefined
}

const defaults: Record<string, () => Record<string, unknown>> = {
  NativeAppleTranscription: () => ({
    isAvailable: () => true,
    prepare: async () => undefined,
  }),
  NativeAppleSpeech: () => ({
    getVoices: async () => [],
  }),
}

const registry = (globalThis.__rnaiTurboStubs ??= {})

function withDefaults(name: string): Record<string, unknown> {
  const stub = (registry[name] ??= {})
  for (const [key, value] of Object.entries(defaults[name]?.() ?? {})) {
    stub[key] ??= value
  }
  return stub
}

for (const name of Object.keys(defaults)) {
  withDefaults(name)
}

mock.module('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (specifics: Record<string, unknown>) => specifics.android,
  },
  TurboModuleRegistry: {
    getEnforcing: (name: string) => withDefaults(name),
    get: (name: string) => withDefaults(name),
  },
}))

export function getTurboModuleStub(name: string): Record<string, unknown> {
  return withDefaults(name)
}

export function getAppleLLMStub() {
  return getTurboModuleStub('NativeAppleLLM')
}

export function getAppleUtilsStub() {
  return getTurboModuleStub('NativeAppleUtils')
}

export function getAppleEmbeddingsStub() {
  return getTurboModuleStub('NativeAppleEmbeddings')
}

export type FakeEmitter<T> = {
  on: (handler: (event: T) => void) => { remove(): void }
  emit: (event: T) => void
  handlerCount: () => number
}

export function createFakeEmitter<T>(): FakeEmitter<T> {
  const handlers = new Set<(event: T) => void>()
  return {
    on: (handler) => {
      handlers.add(handler)
      return { remove: () => handlers.delete(handler) }
    },
    emit: (event) => {
      for (const handler of [...handlers]) {
        handler(event)
      }
    },
    handlerCount: () => handlers.size,
  }
}

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
