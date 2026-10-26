import { generateId } from '@ai-sdk/provider-utils'

import { toAbortError } from './ai-sdk'
import NativeCoreAI, { type CoreAIDownloadProgressEvent } from './NativeCoreAI'
import type {
  CoreAIModelConfig,
  CoreAIModelInfo,
  CoreAIModelSource,
  CoreAISpecializationOptions,
} from './types'
import { toNativeModelConfig } from './types'

export type CoreAIFileSource = Extract<CoreAIModelSource, { type: 'file' }>

export interface CoreAIDownloadProgress {
  bytesWritten: number
  totalBytes: number
  // 0 to 100
  percentage: number
}

export interface CoreAIDownloadOptions {
  // Name of the model directory in app storage
  id: string
  // Hugging Face repo, such as `grabbou/qwen3-0.6b-CoreAI`
  repo: string
  // Folder of the repo that holds the model. The whole repo by default
  folder?: string
  // Branch, tag or commit, `main` by default
  revision?: string
  onProgress?: (progress: CoreAIDownloadProgress) => void
  // Stops the download. Files already downloaded are kept, so downloading the
  // model again resumes it
  signal?: AbortSignal
}

// Where `downloadModel` stores a model
export function getModelSource(id: string): CoreAIFileSource {
  return {
    type: 'file',
    uri: `${NativeCoreAI.getModelsDirectory()}/${id}`,
  }
}

// Whether `downloadModel` finished downloading the model
export function isModelDownloaded(id: string): boolean {
  return NativeCoreAI.isModelDownloaded(id)
}

// Downloads a Hugging Face folder into app storage, unless it is there
// already, and returns its source for `coreAI.languageModel(...)` and the
// other models. A model directory that exists is always complete, and a
// download that stops midway resumes on the next call
export async function downloadModel({
  onProgress,
  signal,
  ...options
}: CoreAIDownloadOptions): Promise<CoreAIFileSource> {
  if (signal?.aborted) {
    throw toAbortError(signal)
  }
  const downloadId = generateId()
  const listener = NativeCoreAI.onDownloadProgress(
    (event: CoreAIDownloadProgressEvent) => {
      if (event.downloadId === downloadId) {
        onProgress?.({
          bytesWritten: event.bytesWritten,
          totalBytes: event.totalBytes,
          percentage:
            event.totalBytes > 0
              ? Math.round((event.bytesWritten / event.totalBytes) * 100)
              : 0,
        })
      }
    }
  )
  const cancel = () => NativeCoreAI.cancelStream(downloadId)
  signal?.addEventListener('abort', cancel, { once: true })

  try {
    const { uri } = (await NativeCoreAI.downloadModel(downloadId, options)) as {
      uri: string
    }
    return { type: 'file', uri }
  } catch (error) {
    if (signal?.aborted) {
      throw toAbortError(signal)
    }
    throw error
  } finally {
    listener.remove()
    signal?.removeEventListener('abort', cancel)
  }
}

// Specializes the model's .aimodel assets for this device ahead of time, so
// the first load doesn't. Pass the task the model is used for: its loader
// specializes with options of its own, and the cache only matches those.
// `metadata.assets` reports each asset and whether it was cached already
export async function specializeModel(
  config: CoreAIModelConfig,
  options: CoreAISpecializationOptions = {}
): Promise<CoreAIModelInfo> {
  return NativeCoreAI.specializeModel(
    toNativeModelConfig(config),
    options
  ) as Promise<CoreAIModelInfo>
}

// Deletes the specialized assets of a model, so the next load specializes
// it again. Unload the model first, as entries in use can't be deleted
export async function clearSpecializationCache(
  config: CoreAIModelConfig
): Promise<void> {
  await NativeCoreAI.clearSpecializationCache(toNativeModelConfig(config))
}

// Deletes a model's files and its specialized assets. Unload the model first
export async function removeModel(config: CoreAIModelConfig): Promise<void> {
  await NativeCoreAI.removeModel(toNativeModelConfig(config))
}
