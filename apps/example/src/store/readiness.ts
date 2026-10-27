import type { FeatureId } from './features'
import { isTranscriptionAvailable, useEmbeddingsStatus } from './features'
import { useModels } from './models'

// Whether each feature has what it needs on this device right now
export function useFeatureReadiness(): Record<FeatureId, boolean> {
  const { readyModels } = useModels()
  const { status: embeddingsStatus } = useEmbeddingsStatus()
  const hasChatModel = readyModels.length > 0

  return {
    chat: hasChatModel,
    // Voice answers with the chat model
    voice: hasChatModel && isTranscriptionAvailable(),
    search: embeddingsStatus === 'ready',
  }
}
