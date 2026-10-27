import { apple, AppleEmbeddings, AppleUtils } from '@react-native-ai/apple'
import type { SFSymbol } from 'expo-symbols'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { atomWithRefresh, loadable } from 'jotai/utils'
import { Platform } from 'react-native'

import { isSimulator } from '../simulator'
import { atomWithPersistence } from './storage'

export type FeatureId = 'chat' | 'voice' | 'search'

export type Feature = {
  id: FeatureId
  title: string
  description: string
  symbol: SFSymbol
  // Shown on the feature's onboarding page
  highlights: string[]
}

export const features: Feature[] = [
  {
    id: 'chat',
    title: 'Chat',
    description: 'Ask anything, attach photos, get answers in seconds.',
    symbol: 'bubble.left.and.text.bubble.right.fill',
    highlights: [
      'Answers stream in as they are written',
      'Attach photos with models that can see',
      'Pick Apple Intelligence or an open model',
    ],
  },
  {
    id: 'voice',
    title: 'Voice',
    description: 'Talk and hear the answer, transcribed live as you speak.',
    symbol: 'waveform',
    highlights: [
      'Your words appear while you talk',
      'Replies are read aloud with an on-device voice',
      'No audio is recorded or uploaded',
    ],
  },
  {
    id: 'search',
    title: 'Search',
    description: 'Find notes by meaning, not by matching words.',
    symbol: 'text.magnifyingglass',
    highlights: [
      '“Pet health” finds the vet visit note',
      'Add your own notes and search them',
      'Notes are indexed on device, once',
    ],
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
  if (isSimulator) return true
  return Platform.OS === 'ios' && apple.transcriptionModel().isAvailable()
}

// Apple's embedding assets ship separately and download on first prepare
const embeddingsStatusAtom = atomWithRefresh(
  async (): Promise<AppleAssetStatus> => {
    if (isSimulator) {
      return 'ready'
    }
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
