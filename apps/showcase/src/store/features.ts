import { apple, AppleEmbeddings, AppleUtils } from '@react-native-ai/apple'
import type { SFSymbol } from 'expo-symbols'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithRefresh, loadable } from 'jotai/utils'
import { Platform } from 'react-native'

import { atomWithPersistence } from './storage'

export type FeatureId = 'chat' | 'voice' | 'search'

export type Feature = {
  id: FeatureId
  title: string
  description: string
  symbol: SFSymbol
}

export const features: Feature[] = [
  {
    id: 'chat',
    title: 'Chat',
    description: 'Ask anything, attach photos, get answers in seconds.',
    symbol: 'bubble.left.and.text.bubble.right.fill',
  },
  {
    id: 'voice',
    title: 'Voice',
    description: 'Talk and hear the answer, transcribed live as you speak.',
    symbol: 'waveform',
  },
  {
    id: 'search',
    title: 'Search',
    description: 'Find notes by meaning, not by matching words.',
    symbol: 'text.magnifyingglass',
  },
]

const onboardedAtom = atomWithPersistence('onboarded', false)

const enabledFeaturesAtom = atomWithPersistence<FeatureId[]>(
  'enabledFeatures',
  features.map((feature) => feature.id)
)

export function useOnboarding() {
  const [onboarded, setOnboarded] = useAtom(onboardedAtom)
  return { onboarded, setOnboarded }
}

export function useEnabledFeatures() {
  const [enabledFeatures, setEnabledFeatures] = useAtom(enabledFeaturesAtom)

  const toggleFeature = (id: FeatureId) => {
    setEnabledFeatures((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  return {
    enabledFeatures,
    isEnabled: (id: FeatureId) => enabledFeatures.includes(id),
    toggleFeature,
  }
}

export type AppleAssetStatus = 'ready' | 'download' | 'unsupported'

function deviceLanguage() {
  return Platform.OS === 'ios' ? AppleUtils.getCurrentLocale() : 'en-US'
}

export function isTranscriptionAvailable() {
  return Platform.OS === 'ios' && apple.transcriptionModel().isAvailable()
}

// Apple's embedding assets ship separately and download on first prepare
const embeddingsStatusAtom = atomWithRefresh(
  async (): Promise<AppleAssetStatus> => {
    if (Platform.OS !== 'ios') {
      return 'unsupported'
    }
    try {
      const info = await AppleEmbeddings.getModelInfo(deviceLanguage())
      return info.hasAvailableAssets ? 'ready' : 'download'
    } catch {
      return 'unsupported'
    }
  }
)

const embeddingsStatusLoadableAtom = loadable(embeddingsStatusAtom)

export function useEmbeddingsStatus() {
  const status = useAtomValue(embeddingsStatusLoadableAtom)
  const refresh = useSetAtom(embeddingsStatusAtom)

  const prepare = async () => {
    await AppleEmbeddings.prepare(deviceLanguage())
    refresh()
  }

  return {
    status: status.state === 'hasData' ? status.data : null,
    prepare,
  }
}
