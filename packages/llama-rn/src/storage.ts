import RNBlobUtil from 'react-native-blob-util'

let storagePath = `${RNBlobUtil.fs.dirs.DocumentDir}/llama-rn-models`

export interface DownloadProgress {
  percentage: number
}

export interface ModelInfo {
  model_id: string
  path: string
  filename: string
  sizeBytes?: number
}

export function setStoragePath(path: string): void {
  storagePath = path
}

export function getStoragePath(): string {
  return storagePath
}

export function parseModelId(modelId: string): {
  repo: string
  filename: string
} {
  const parts = modelId.split('/')
  if (parts.length < 3) {
    throw new Error(
      `Invalid model ID format: "${modelId}". Expected format: "owner/repo/filename.gguf"`
    )
  }
  const filename = parts.pop()!
  const repo = parts.join('/')
  return { repo, filename }
}

export function getModelPath(modelId: string): string {
  const { filename } = parseModelId(modelId)
  return `${storagePath}/${filename}`
}

export async function isModelDownloaded(modelId: string): Promise<boolean> {
  const path = getModelPath(modelId)
  return RNBlobUtil.fs.exists(path)
}

export async function getDownloadedModels(): Promise<ModelInfo[]> {
  try {
    const exists = await RNBlobUtil.fs.exists(storagePath)
    if (!exists) {
      return []
    }

    const files = await RNBlobUtil.fs.ls(storagePath)
    const models: ModelInfo[] = []

    for (const filename of files) {
      if (filename.endsWith('.gguf')) {
        const path = `${storagePath}/${filename}`
        const stat = await RNBlobUtil.fs.stat(path)

        models.push({
          model_id: filename,
          path,
          filename,
          sizeBytes: Number(stat.size),
        })
      }
    }

    return models
  } catch (error) {
    console.error('Failed to get downloaded models:', error)
    return []
  }
}

export async function downloadModel(
  modelId: string,
  progressCallback?: (progress: DownloadProgress) => void
): Promise<string> {
  const { repo, filename } = parseModelId(modelId)
  const url = `https://huggingface.co/${repo}/resolve/main/${filename}?download=true`
  const destPath = `${storagePath}/${filename}`

  const dirExists = await RNBlobUtil.fs.exists(storagePath)
  if (!dirExists) {
    await RNBlobUtil.fs.mkdir(storagePath)
  }

  const fileExists = await RNBlobUtil.fs.exists(destPath)
  if (fileExists) {
    progressCallback?.({ percentage: 100 })
    return destPath
  }

  const result = await RNBlobUtil.config({
    path: destPath,
    fileCache: true,
  })
    .fetch('GET', url)
    .progress((received, total) => {
      const percentage = Math.round((Number(received) / Number(total)) * 100)
      progressCallback?.({ percentage })
    })

  return result.path()
}

export async function removeModel(modelId: string): Promise<void> {
  const path = getModelPath(modelId)
  const exists = await RNBlobUtil.fs.exists(path)
  if (exists) {
    await RNBlobUtil.fs.unlink(path)
  }
}
