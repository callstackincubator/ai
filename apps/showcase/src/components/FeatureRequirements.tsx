import React, { useState } from 'react'
import { Alert } from 'react-native'

import type { FeatureId } from '../store/features'
import {
  isTranscriptionAvailable,
  useEmbeddingsStatus,
} from '../store/features'
import { chatModels, useDownloadProgress, useModels } from '../store/models'
import { RequirementRow } from './RequirementRow'

const showError = (title: string) => (error: unknown) =>
  Alert.alert(title, error instanceof Error ? error.message : undefined)

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
            ? 'Built into iOS, nothing to download'
            : 'Needs an iPhone with Apple Intelligence turned on'
        }
        state={status === 'yes' ? 'ready' : 'unavailable'}
      />
    )
  }

  return (
    <RequirementRow
      symbol="arrow.down.circle"
      title={adapter.label}
      subtitle={
        status === 'yes'
          ? 'Downloaded, runs offline'
          : 'Open model, downloads once and runs offline'
      }
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

function EmbeddingsRow() {
  const { status, prepare } = useEmbeddingsStatus()
  const [isPreparing, setIsPreparing] = useState(false)

  return (
    <RequirementRow
      symbol="point.3.connected.trianglepath.dotted"
      title="Apple embeddings"
      subtitle={
        status === 'unsupported'
          ? 'Not available on this device'
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
  switch (feature) {
    case 'chat':
      return chatModels.map((adapter, index) => (
        <ChatModelRow key={adapter.modelId} index={index} />
      ))
    case 'voice':
      return (
        <RequirementRow
          symbol="mic"
          title="Speech recognition"
          subtitle={
            isTranscriptionAvailable()
              ? 'Transcribes on device as you speak'
              : 'Not available for your language'
          }
          state={isTranscriptionAvailable() ? 'ready' : 'unavailable'}
        />
      )
    case 'search':
      return <EmbeddingsRow />
  }
}
