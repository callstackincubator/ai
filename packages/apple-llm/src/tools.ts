import { type Tool } from 'ai'

type Tools = Record<string, Function>

declare global {
  var __APPLE_LLM_TOOLS__: Record<string, Function>
}

export function registerTools(tools: Record<string, Tool>): void {
  if (globalThis.__APPLE_LLM_TOOLS__) {
    throw new Error('Tools already initialized')
  }
  globalThis.__APPLE_LLM_TOOLS__ = Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [name, tool.execute])
  )
  console.log(globalThis.__APPLE_LLM_TOOLS__)
}

export function getRegisteredTools(): Tools {
  return __APPLE_LLM_TOOLS__
}
