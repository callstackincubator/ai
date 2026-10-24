import { mock } from 'bun:test'

declare global {
  var __rnaiTurboStubs: Record<string, Record<string, unknown>> | undefined
}

const registry = (globalThis.__rnaiTurboStubs ??= {})

mock.module('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (specifics: Record<string, unknown>) => specifics.android,
  },
  TurboModuleRegistry: {
    getEnforcing: (name: string) => (registry[name] ??= {}),
    get: (name: string) => (registry[name] ??= {}),
  },
}))

export function getTurboModuleStub(name: string): Record<string, unknown> {
  registry[name] ??= {}
  return registry[name]
}
export function getMLCStub() {
  return getTurboModuleStub('MLCEngine')
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
