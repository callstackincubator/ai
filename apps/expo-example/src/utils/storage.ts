import { getModelPath } from '@react-native-ai/llama/src/storage'
import { File } from 'expo-file-system'

export function isModelDownloaded(modelId: string): boolean {
  const path = getModelPath(modelId)
  return new File(path).exists
}
