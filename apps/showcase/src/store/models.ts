import type { LanguageModelV4 } from '@ai-sdk/provider'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithRefresh } from 'jotai/utils'

import { createAppleLanguageSetupAdapter } from '../adapters/apple'
import { createLlamaLanguageSetupAdapter } from '../adapters/llama'
import type { Availability, SetupAdapter } from '../adapters/types'
import { atomWithPersistence } from './storage'

export const chatModels: SetupAdapter<LanguageModelV4>[] = [
  createAppleLanguageSetupAdapter(),
  // Vision, reasoning and tool calling in a small download
  createLlamaLanguageSetupAdapter({
    label: 'Qwen3.5 2B',
    modelId: 'bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf',
    projectorId:
      'bartowski/Qwen_Qwen3.5-2B-GGUF/mmproj-Qwen_Qwen3.5-2B-f16.gguf',
  }),
  // Vision, audio, reasoning and tool calling
  createLlamaLanguageSetupAdapter({
    label: 'Gemma 4 E2B',
    modelId: 'ggml-org/gemma-4-E2B-it-GGUF/gemma-4-E2B-it-Q4_0.gguf',
    projectorId: 'ggml-org/gemma-4-E2B-it-GGUF/mmproj-gemma-4-E2B-it-Q8_0.gguf',
  }),
]

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
    selectModel: setSelectedModelId,
    downloadModel,
    deleteModel,
  }
}

export function useDownloadProgress(modelId: string): number | undefined {
  return useAtomValue(downloadProgressAtom)[modelId]
}
