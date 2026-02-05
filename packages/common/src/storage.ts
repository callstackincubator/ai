import RNBlobUtil from 'react-native-blob-util'

export interface DownloadProgress {
  percentage: number
}

export type ProgressCallback = (progress: DownloadProgress) => void

export interface ModelInfo {
  model_id: string
  path: string
  filename: string
  sizeBytes?: number
}

export class AISDKStorage {
  protected storagePath: string

  constructor(
    libName: string,
    protected formatExtension: string
  ) {
    this.storagePath = `${RNBlobUtil.fs.dirs.DocumentDir}/${libName}-models`
  }

  setStoragePath(path: string): void {
    this.storagePath = path
  }

  getStoragePath(): string {
    return this.storagePath
  }

  parseModelId(repoURI: string): {
    repo: string
    filename: string
  } {
    const parts = repoURI.split('/')
    if (parts.length < 3) {
      throw new Error(
        `Invalid model ID format: "${repoURI}". Expected format: "owner/repo/filename.${this.formatExtension}"`
      )
    }
    const [ownerPart, repoPart, ...filenameParts] = parts
    const filename = filenameParts.join('/')
    const repo = `${ownerPart}/${repoPart}`
    return { repo, filename }
  }

  getModelPath(repoURI: string): string {
    const { filename } = this.parseModelId(repoURI)
    return `${this.storagePath}/${filename}`
  }

  async isModelDownloaded(repoURI: string): Promise<boolean> {
    const path = this.getModelPath(repoURI)
    return RNBlobUtil.fs.exists(path)
  }

  async getDownloadedModels(): Promise<ModelInfo[]> {
    try {
      const exists = await RNBlobUtil.fs.exists(this.storagePath)
      if (!exists) {
        return []
      }

      const files = await RNBlobUtil.fs.ls(this.storagePath)
      const models: ModelInfo[] = []

      for (const filename of files) {
        if (filename.endsWith(`.${this.formatExtension}`)) {
          const path = `${this.storagePath}/${filename}`
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

  getHFURL(repo: string, filename: string): string {
    return `https://huggingface.co/${repo}/resolve/main/${filename}`
  }

  async downloadModel(
    modelId: string,
    progressCallback?: ProgressCallback
  ): Promise<string> {
    const { repo, filename } = this.parseModelId(modelId)
    const url = `${this.getHFURL(repo, filename)}?download=true`
    const destPath = `${this.storagePath}/${filename}`

    const dirExists = await RNBlobUtil.fs.exists(this.storagePath)
    if (!dirExists) {
      await RNBlobUtil.fs.mkdir(this.storagePath)
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

  async removeModel(modelId: string): Promise<void> {
    const path = this.getModelPath(modelId)
    const exists = await RNBlobUtil.fs.exists(path)
    if (exists) {
      await RNBlobUtil.fs.unlink(path)
    }
  }
}
