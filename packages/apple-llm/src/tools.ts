import { type Tool } from 'ai'

type Tools = Record<string, Function>

declare global {
  var __APPLE_LLM_TOOLS__: Record<string, Function>
}

globalThis.__APPLE_LLM_TOOLS__ = {}

export function registerTools(tools: Record<string, Tool>): void {
  for (const [id, tool] of Object.entries(tools)) {
    globalThis.__APPLE_LLM_TOOLS__[id] = tool.execute
  }
}

export function getRegisteredTools(): Tools {
  return __APPLE_LLM_TOOLS__
}

export function clearTools(keys: string[]): void {
  for (const key of keys) {
    globalThis.__APPLE_LLM_TOOLS__[key] = undefined
  }
}
