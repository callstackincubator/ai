import { getModelPath } from '@react-native-ai/llama/src/storage'
import { File } from 'expo-file-system'

export function isLlamaModelDownloaded(modelId: string): boolean {
  let path = getModelPath(modelId)

  // expo-file-system requires that this URI starts with the file:// protocol
  if (!path.startsWith('file://')) {
    path = `file://${path}`
  }

  return new File(path).exists
}
