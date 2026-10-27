import type { LanguageModelV4 } from '@ai-sdk/provider'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithRefresh } from 'jotai/utils'

import { createAppleLanguageSetupAdapter } from '../adapters/apple'
import { createLlamaLanguageSetupAdapter } from '../adapters/llama'
import type { Availability, Runtime, SetupAdapter } from '../adapters/types'
import { atomWithPersistence } from './storage'

export const chatModels: SetupAdapter<LanguageModelV4>[] = [
  createAppleLanguageSetupAdapter(),
  createLlamaLanguageSetupAdapter({
    label: 'Qwen3.5 2B',
    description: 'Small and quick',
    sizeBytes: 1_396_198_496 + 668_227_136,
    modelId: 'bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf',
    projectorId:
      'bartowski/Qwen_Qwen3.5-2B-GGUF/mmproj-Qwen_Qwen3.5-2B-f16.gguf',
  }),
  createLlamaLanguageSetupAdapter({
    label: 'Gemma 4 E2B',
    description: "Google's open model, stronger answers",
    sizeBytes: 2_841_481_184 + 557_368_064,
    modelId: 'ggml-org/gemma-4-E2B-it-GGUF/gemma-4-E2B-it-Q4_0.gguf',
    projectorId: 'ggml-org/gemma-4-E2B-it-GGUF/mmproj-gemma-4-E2B-it-Q8_0.gguf',
  }),
]

export const runtimes: Record<Runtime, { title: string; subtitle: string }> = {
  apple: {
    title: 'Built into iOS',
    subtitle: 'Apple Intelligence runs on Apple silicon. Nothing to download.',
  },
  llama: {
    title: 'Open models',
    subtitle: 'Run with llama.cpp. Download once, then they work offline.',
  },
}

export function formatSize(bytes: number) {
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.round(bytes / 1e6)} MB`
}

const availabilityAtom = atomWithRefresh(
  () =>
    new Map<string, Availability>(
      chatModels.map((adapter) => [adapter.modelId, adapter.isAvailable()])
    )
)

const downloadProgressAtom = atom<Record<string, number>>({})

const selectedModelIdAtom = atomWithPersistence<string | null>(
  'selectedModelId',
  null
)

export function useModels() {
  const availability = useAtomValue(availabilityAtom)
  const refreshAvailability = useSetAtom(availabilityAtom)
  const setDownloadProgress = useSetAtom(downloadProgressAtom)
  const [selectedModelId, setSelectedModelId] = useAtom(selectedModelIdAtom)

  const readyModels = chatModels.filter(
    (adapter) => availability.get(adapter.modelId) === 'yes'
  )
  // Falls back to the first ready model when the chosen one is gone
  const selectedModel =
    readyModels.find((adapter) => adapter.modelId === selectedModelId) ??
    readyModels[0]

  const downloadModel = async (adapter: SetupAdapter<LanguageModelV4>) => {
    const { modelId } = adapter
    setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }))
    try {
      await adapter.download((percentage) => {
        setDownloadProgress((prev) =>
          prev[modelId] !== percentage
            ? { ...prev, [modelId]: percentage }
            : prev
        )
      })
    } finally {
      setDownloadProgress((prev) => {
        const next = { ...prev }
        delete next[modelId]
        return next
      })
      refreshAvailability()
    }
  }

  const deleteModel = async (adapter: SetupAdapter<LanguageModelV4>) => {
    await adapter.delete()
    refreshAvailability()
  }

  return {
    availability,
    readyModels,
    selectedModel,
    // Frees the previous model, as each open model holds gigabytes of memory
    selectModel: (modelId: string) => {
      if (selectedModel && selectedModel.modelId !== modelId) {
        selectedModel.unload()
      }
      setSelectedModelId(modelId)
    },
    downloadModel,
    deleteModel,
  }
}

export function useDownloadProgress(modelId: string): number | undefined {
  return useAtomValue(downloadProgressAtom)[modelId]
}
