import type { TurboModule } from 'react-native'
import {
  NativeEventEmitter,
  NativeModules,
  TurboModuleRegistry,
} from 'react-native'

import type { AiModelSettings, Message } from './mlc-provider'

export interface Spec extends TurboModule {
  getModel(name: string): Promise<string>
  getModels(): Promise<AiModelSettings[]>
  doGenerate(instanceId: string, messages: Message[]): Promise<string>
  doStream(instanceId: string, messages: Message[]): Promise<string>
  downloadModel(instanceId: string): Promise<string>
  prepareModel(instanceId: string): Promise<string>
}

const NativeMLCEngine = TurboModuleRegistry.getEnforcing<Spec>('Ai')

interface DownloadProgress {
  percentage: number
}

export async function downloadModel(
  modelId: string,
  callbacks?: {
    onStart?: () => void
    onProgress?: (progress: DownloadProgress) => void
    onComplete?: () => void
    onError?: (error: Error) => void
  }
): Promise<void> {
  const eventEmitter = new NativeEventEmitter(NativeModules.Ai)

  const downloadStartListener = eventEmitter.addListener(
    'onDownloadStart',
    () => {
      callbacks?.onStart?.()
    }
  )

  const downloadProgressListener = eventEmitter.addListener(
    'onDownloadProgress',
    (progress: DownloadProgress) => {
      callbacks?.onProgress?.(progress)
    }
  )

  const downloadCompleteListener = eventEmitter.addListener(
    'onDownloadComplete',
    () => {
      callbacks?.onComplete?.()
      downloadStartListener.remove()
      downloadProgressListener.remove()
      downloadCompleteListener.remove()
      downloadErrorListener.remove()
    }
  )

  const downloadErrorListener = eventEmitter.addListener(
    'onDownloadError',
    (error) => {
      callbacks?.onError?.(new Error(error.message || 'Unknown download error'))
      downloadStartListener.remove()
      downloadProgressListener.remove()
      downloadCompleteListener.remove()
      downloadErrorListener.remove()
    }
  )

  try {
    await NativeMLCEngine.downloadModel(modelId)
  } catch (error) {
    downloadStartListener.remove()
    downloadProgressListener.remove()
    downloadCompleteListener.remove()
    downloadErrorListener.remove()
    throw error
  }
}

export default {
  getModel: NativeMLCEngine.getModel,
  getModels: NativeMLCEngine.getModels,
  doGenerate: NativeMLCEngine.doGenerate,
  doStream: NativeMLCEngine.doStream,
  downloadModel,
  prepareModel: NativeMLCEngine.prepareModel,
}
