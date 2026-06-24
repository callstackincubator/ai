import { adk } from '@react-native-ai/adk'
import { generateId } from 'ai'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithRefresh, loadable } from 'jotai/utils'
import { Platform } from 'react-native'

import { createLlamaLanguageSetupAdapter } from '../components/adapters/llamaModelSetupAdapter'
import { languageAdapters } from '../config/providers'
import type { Availability } from '../config/providers.common'

export type CustomModel = {
  id: string
  name: string
  url: string
}

export type NanoUnavailableReason = 'unsupported' | 'not-ready'

type AvailabilityState = {
  availability: Map<string, Availability>
  nanoUnavailableReason: NanoUnavailableReason | null
}

// todo: persist custom models in storage (synchronous)
const customModelsAtom = atom<CustomModel[]>([])

const adaptersAtom = atom((get) => {
  const customModels = get(customModelsAtom).map((model) =>
    createLlamaLanguageSetupAdapter(model.url)
  )
  return [...languageAdapters, ...customModels]
})

const availabilityAtom = atomWithRefresh(async (get) => {
  const adapters = get(adaptersAtom)
  const availability = new Map<string, Availability>()
  let nanoUnavailableReason: NanoUnavailableReason | null = null

  for (const adapter of adapters) {
    if (adapter.modelId === 'adk-gemini-nano') {
      continue
    }
    availability.set(adapter.modelId, adapter.isAvailable())
  }

  if (Platform.OS === 'android') {
    const supported = await adk.isNanoSupported()
    if (!supported) {
      availability.set('adk-gemini-nano', 'no')
      nanoUnavailableReason = 'unsupported'
    } else {
      const ready = await adk.isAvailable('genai-nano')
      availability.set('adk-gemini-nano', ready ? 'yes' : 'no')
      if (!ready) {
        nanoUnavailableReason = 'not-ready'
      }
    }
  } else {
    availability.set('adk-gemini-nano', 'no')
    nanoUnavailableReason = 'unsupported'
  }

  return { availability, nanoUnavailableReason } satisfies AvailabilityState
})

const downloadProgressAtom = atom<Record<string, number>>({})

const availabilityLoadableAtom = loadable(availabilityAtom)

export function useProviderStore() {
  const adapters = useAtomValue(adaptersAtom)
  const availabilityLoadable = useAtomValue(availabilityLoadableAtom)
  const refreshAvailability = useSetAtom(availabilityAtom)

  const availabilityState: AvailabilityState =
    availabilityLoadable.state === 'hasData'
      ? availabilityLoadable.data
      : { availability: new Map(), nanoUnavailableReason: null }

  const setCustomModels = useSetAtom(customModelsAtom)
  const setDownloadProgress = useSetAtom(downloadProgressAtom)

  const addCustomModel = (url: string) => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl || !trimmedUrl.endsWith('.gguf')) {
      throw new Error('Invalid model URL')
    }
    const id = generateId()
    setCustomModels((prev) => {
      return [
        ...prev,
        {
          id,
          name: trimmedUrl.split('/').pop() || 'Custom Model',
          url: trimmedUrl,
        },
      ]
    })
    return id
  }

  const removeModel = async (modelId: string) => {
    const adapter = adapters.find((adapter) => adapter.modelId === modelId)
    if (!adapter) {
      throw new Error(`Adapter not found for model ID: ${modelId}`)
    }
    await adapter.delete()
    setCustomModels((prev) => {
      return prev.filter((model) => model.id !== modelId)
    })
    refreshAvailability()
  }

  const downloadModel = async (modelId: string) => {
    const adapter = adapters.find((adapter) => adapter.modelId === modelId)
    if (!adapter) {
      throw new Error(`Adapter not found for model ID: ${modelId}`)
    }
    setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }))
    await adapter
      .download((percentage) => {
        setDownloadProgress((prev) =>
          prev[modelId] !== percentage
            ? { ...prev, [modelId]: percentage }
            : prev
        )
      })
      .then(() => refreshAvailability())
      .finally(() => {
        setDownloadProgress((prev) => {
          const next = { ...prev }
          delete next[modelId]
          return next
        })
      })
  }

  return {
    adapters,
    availability: availabilityState.availability,
    nanoUnavailableReason: availabilityState.nanoUnavailableReason,
    removeModel,
    addCustomModel,
    downloadModel,
  }
}

export function useDownloadProgress(modelId: string) {
  const downloadProgress = useAtomValue(downloadProgressAtom)
  return downloadProgress[modelId]
}
