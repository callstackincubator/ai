import { getModelPath } from '@react-native-ai/llama/src/storage'
import { File } from 'expo-file-system'

export function isModelDownloaded(modelId: string): boolean {
  let path = getModelPath(modelId)

  if (!path.startsWith('file://')) {
    path = `file://${path}`
  }

  return new File(path).exists
}
