import React, { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'

import type { Capability, Runtime } from '../adapters/types'
import { isSimulator } from '../simulator'
import type { FeatureId } from '../store/features'
import {
  isTranscriptionAvailable,
  useEmbeddingsStatus,
  useEnabledFeatures,
} from '../store/features'
import {
  chatModels,
  formatSize,
  runtimes,
  useDownloadProgress,
  useModels,
} from '../store/models'
import { colors } from '../theme/colors'
import { RequirementRow } from './RequirementRow'

const showError = (title: string) => (error: unknown) =>
  Alert.alert(title, error instanceof Error ? error.message : undefined)

const capabilityLabels: Record<Capability, string> = {
  vision: 'sees photos',
  reasoning: 'reasons',
  tools: 'uses tools',
}

function ChatModelRow({ index }: { index: number }) {
  const adapter = chatModels[index]
  const { availability, downloadModel } = useModels()
  const progress = useDownloadProgress(adapter.modelId)
  const status = availability.get(adapter.modelId)

  if (adapter.builtIn) {
    return (
      <RequirementRow
        symbol="apple.intelligence"
        title={adapter.label}
        subtitle={
          status === 'yes'
            ? adapter.description
            : 'Needs an iPhone 15 Pro or later with Apple Intelligence on'
        }
        state={status === 'yes' ? 'ready' : 'unavailable'}
      />
    )
  }

  const details = [
    adapter.description,
    adapter.capabilities.includes('vision') ? capabilityLabels.vision : null,
    adapter.sizeBytes ? formatSize(adapter.sizeBytes) : null,
  ].filter(Boolean)

  return (
    <RequirementRow
      symbol="cpu"
      title={adapter.label}
      subtitle={details.join(' · ')}
      state={
        progress !== undefined
          ? 'working'
          : status === 'yes'
            ? 'ready'
            : 'action'
      }
      progress={progress}
      actionTitle="Get"
      onAction={() =>
        downloadModel(adapter).catch(showError('Download failed'))
      }
    />
  )
}

function RuntimeGroup({ runtime }: { runtime: Runtime }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{runtimes[runtime].title}</Text>
      <Text style={styles.groupSubtitle}>{runtimes[runtime].subtitle}</Text>
      {chatModels.map((adapter, index) =>
        adapter.runtime === runtime ? (
          <ChatModelRow key={adapter.modelId} index={index} />
        ) : null
      )}
    </View>
  )
}

function EmbeddingsRow() {
  const { status, prepare } = useEmbeddingsStatus()
  const [isPreparing, setIsPreparing] = useState(false)

  return (
    <RequirementRow
      symbol="point.3.connected.trianglepath.dotted"
      title="Apple embeddings"
      subtitle={
        isSimulator
          ? 'Simulator preview: matches shared words instead'
          : status === 'unsupported'
            ? 'Not available on this iPhone'
            : 'Turns text into meaning, built into iOS'
      }
      state={
        isPreparing || status === null
          ? 'working'
          : status === 'ready'
            ? 'ready'
            : status === 'download'
              ? 'action'
              : 'unavailable'
      }
      actionTitle="Get"
      onAction={() => {
        setIsPreparing(true)
        prepare()
          .catch(showError('Could not set up embeddings'))
          .finally(() => setIsPreparing(false))
      }}
    />
  )
}

// What a feature needs, with a way to get each missing piece
export function FeatureRequirements({ feature }: { feature: FeatureId }) {
  const { isEnabled } = useEnabledFeatures()
  switch (feature) {
    case 'chat':
      return (
        <>
          <RuntimeGroup runtime="apple" />
          <RuntimeGroup runtime="llama" />
        </>
      )
    case 'voice':
      return (
        <>
          <RequirementRow
            symbol="mic"
            title="Speech recognition"
            subtitle={
              isSimulator
                ? 'Simulator preview: hears a scripted question'
                : isTranscriptionAvailable()
                  ? 'Transcribes on device as you speak'
                  : 'Not available for your language'
            }
            state={isTranscriptionAvailable() ? 'ready' : 'unavailable'}
          />
          <RequirementRow
            symbol="speaker.wave.2"
            title="Spoken replies"
            subtitle="An on-device voice, answers come from your chat model"
            state="ready"
          />
          {/* Voice answers with a chat model, listed under Chat when it's on */}
          {!isEnabled('chat') && (
            <>
              <RuntimeGroup runtime="apple" />
              <RuntimeGroup runtime="llama" />
            </>
          )}
        </>
      )
    case 'search':
      return <EmbeddingsRow />
  }
}

const styles = StyleSheet.create({
  group: {
    marginTop: 12,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.label,
  },
  groupSubtitle: {
    fontSize: 13,
    color: colors.secondaryLabel,
  },
})
