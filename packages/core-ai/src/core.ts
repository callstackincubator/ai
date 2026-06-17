import { generateId } from '@ai-sdk/provider-utils'
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes'

import NativeCoreAI from './NativeCoreAI'
import type {
  CoreAICapabilities,
  CoreAIEmbeddingResult,
  CoreAIGenerationOptions,
  CoreAIGenerationPart,
  CoreAIImageGenerationOptions,
  CoreAIImageGenerationResult,
  CoreAILoadedModel,
  CoreAIMessage,
  CoreAIModelConfig,
  CoreAIModelInfo,
  CoreAIModelTask,
  CoreAIStreamCompleteEvent,
  CoreAIStreamErrorEvent,
  CoreAIStreamUpdateEvent,
  CoreAITaskInput,
  CoreAITaskResult,
  CoreAITranscriptionResult,
} from './types'
import { toNativeModelConfig } from './types'

export class CoreAIModel {
  protected loadedModel?: CoreAILoadedModel

  constructor(readonly config: CoreAIModelConfig) {}

  get modelHandle() {
    return this.loadedModel?.modelHandle
  }

  async inspect(): Promise<CoreAIModelInfo> {
    return NativeCoreAI.inspectModel(
      toNativeModelConfig(this.config)
    ) as Promise<CoreAIModelInfo>
  }

  async prepare(options: UnsafeObject = {}): Promise<CoreAIModelInfo> {
    const loadedModel = (await NativeCoreAI.loadModel(
      toNativeModelConfig(this.config),
      options
    )) as CoreAILoadedModel
    this.loadedModel = loadedModel
    return loadedModel.info
  }

  async specialize(options: UnsafeObject = {}): Promise<CoreAIModelInfo> {
    return NativeCoreAI.specializeModel(
      toNativeModelConfig(this.config),
      options
    ) as Promise<CoreAIModelInfo>
  }

  async unload(): Promise<void> {
    if (!this.loadedModel) {
      return
    }
    await NativeCoreAI.unloadModel(this.loadedModel.modelHandle)
    this.loadedModel = undefined
  }

  async remove(): Promise<void> {
    await NativeCoreAI.removeModel(toNativeModelConfig(this.config))
    this.loadedModel = undefined
  }

  protected async ensureLoaded(): Promise<CoreAILoadedModel> {
    if (!this.loadedModel) {
      await this.prepare()
    }
    return this.loadedModel!
  }
}

export class CoreAILanguageSession {
  constructor(readonly sessionHandle: string) {}

  async respond(
    prompt: string,
    options: CoreAIGenerationOptions = {}
  ): Promise<CoreAIGenerationPart[]> {
    return NativeCoreAI.respondToLanguageSession(
      this.sessionHandle,
      prompt,
      options
    ) as Promise<CoreAIGenerationPart[]>
  }

  async stream(
    prompt: string,
    options: CoreAIGenerationOptions = {}
  ): Promise<ReadableStream<CoreAIStreamUpdateEvent>> {
    if (typeof ReadableStream === 'undefined') {
      throw new Error(
        'ReadableStream is not available. Load a web stream polyfill before streaming Core AI responses.'
      )
    }

    const streamId = generateId()
    const sessionHandle = this.sessionHandle
    let listeners: { remove(): void }[] = []

    const cleanup = () => {
      listeners.forEach((listener) => listener.remove())
      listeners = []
    }

    const stream = new ReadableStream<CoreAIStreamUpdateEvent>({
      start(controller) {
        const updateListener = NativeCoreAI.onStreamUpdate(
          (event: CoreAIStreamUpdateEvent) => {
            if (event.streamId === streamId) {
              controller.enqueue(event)
            }
          }
        )
        const completeListener = NativeCoreAI.onStreamComplete(
          (event: CoreAIStreamCompleteEvent) => {
            if (event.streamId === streamId) {
              cleanup()
              controller.close()
            }
          }
        )
        const errorListener = NativeCoreAI.onStreamError(
          (event: CoreAIStreamErrorEvent) => {
            if (event.streamId === streamId) {
              cleanup()
              controller.error(new Error(event.error))
            }
          }
        )

        listeners = [updateListener, completeListener, errorListener]
        NativeCoreAI.streamLanguageSession(
          streamId,
          sessionHandle,
          prompt,
          options
        )
      },
      cancel() {
        cleanup()
        NativeCoreAI.cancelStream(streamId)
      },
    })

    return stream
  }

  async close(): Promise<void> {
    await NativeCoreAI.releaseLanguageSession(this.sessionHandle)
  }
}

export class CoreAILanguageModel extends CoreAIModel {
  async createSession(
    options: UnsafeObject = {}
  ): Promise<CoreAILanguageSession> {
    const model = await this.ensureLoaded()
    const sessionHandle = await NativeCoreAI.createLanguageSession(
      model.modelHandle,
      options
    )
    return new CoreAILanguageSession(sessionHandle)
  }
}

export class CoreAIEmbeddingModel extends CoreAIModel {
  async embed(
    values: string[],
    options: UnsafeObject = {}
  ): Promise<CoreAIEmbeddingResult> {
    return NativeCoreAI.embed(
      toNativeModelConfig(this.config),
      values,
      options
    ) as Promise<CoreAIEmbeddingResult>
  }
}

export class CoreAITranscriptionModel extends CoreAIModel {
  async transcribe(
    audio: Uint8Array | string,
    mediaType: string,
    options: UnsafeObject = {}
  ): Promise<CoreAITranscriptionResult> {
    return NativeCoreAI.transcribe(
      toNativeModelConfig(this.config),
      toBase64(audio),
      mediaType,
      options
    ) as Promise<CoreAITranscriptionResult>
  }
}

export class CoreAIImageModel extends CoreAIModel {
  async generate(
    prompt: string,
    options: CoreAIImageGenerationOptions = {}
  ): Promise<CoreAIImageGenerationResult> {
    return NativeCoreAI.generateImage(
      toNativeModelConfig(this.config),
      prompt,
      options
    ) as Promise<CoreAIImageGenerationResult>
  }
}

class CoreAITaskModel extends CoreAIModel {
  constructor(
    config: CoreAIModelConfig,
    private readonly task: CoreAIModelTask
  ) {
    super({ ...config, task: config.task ?? task })
  }

  async run(
    input: CoreAITaskInput,
    options: UnsafeObject = {}
  ): Promise<CoreAITaskResult> {
    return NativeCoreAI.runTask(
      this.task,
      toNativeModelConfig(this.config),
      input as UnsafeObject,
      options
    ) as Promise<CoreAITaskResult>
  }
}

export class CoreAIRawModel extends CoreAIModel {
  async load(options: UnsafeObject = {}) {
    return this.prepare(options)
  }

  async runFunction(
    functionName: string,
    inputs: UnsafeObject,
    options: UnsafeObject = {}
  ): Promise<UnsafeObject> {
    const model = await this.ensureLoaded()
    return NativeCoreAI.runRawFunction(
      model.modelHandle,
      functionName,
      inputs,
      options
    )
  }
}

export const coreAI = {
  getCapabilities(): Promise<CoreAICapabilities> {
    return NativeCoreAI.getCapabilities() as Promise<CoreAICapabilities>
  },

  languageModel(config: CoreAIModelConfig) {
    return new CoreAILanguageModel({ ...config, task: 'language' })
  },

  embeddingModel(config: CoreAIModelConfig) {
    return new CoreAIEmbeddingModel({ ...config, task: 'embedding' })
  },

  transcriptionModel(config: CoreAIModelConfig) {
    return new CoreAITranscriptionModel({ ...config, task: 'asr' })
  },

  imageModel(config: CoreAIModelConfig) {
    return new CoreAIImageModel({ ...config, task: 'diffusion' })
  },

  segmenter(config: CoreAIModelConfig) {
    return new CoreAITaskModel(config, 'segmentation')
  },

  objectDetector(config: CoreAIModelConfig) {
    return new CoreAITaskModel(config, 'object-detection')
  },

  depthEstimator(config: CoreAIModelConfig) {
    return new CoreAITaskModel(config, 'depth')
  },

  superResolution(config: CoreAIModelConfig) {
    return new CoreAITaskModel(config, 'super-resolution')
  },

  classifier(config: CoreAIModelConfig) {
    return new CoreAITaskModel(config, 'classification')
  },

  models: {
    inspect(config: CoreAIModelConfig) {
      return NativeCoreAI.inspectModel(
        toNativeModelConfig(config)
      ) as Promise<CoreAIModelInfo>
    },
    specialize(config: CoreAIModelConfig, options: UnsafeObject = {}) {
      return NativeCoreAI.specializeModel(
        toNativeModelConfig(config),
        options
      ) as Promise<CoreAIModelInfo>
    },
    remove(config: CoreAIModelConfig) {
      return NativeCoreAI.removeModel(toNativeModelConfig(config))
    },
  },

  embeddings: {
    embed(
      config: CoreAIModelConfig,
      values: string[],
      options: UnsafeObject = {}
    ) {
      return NativeCoreAI.embed(
        toNativeModelConfig({ ...config, task: 'embedding' }),
        values,
        options
      ) as Promise<CoreAIEmbeddingResult>
    },
  },

  unstable: {
    loadModel(config: CoreAIModelConfig) {
      return new CoreAIRawModel({ ...config, task: 'raw' })
    },
  },
}

function toBase64(data: Uint8Array | string): string {
  if (typeof data === 'string') {
    return data
  }

  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export function prepareMessages(messages: unknown): CoreAIMessage[] {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages.map((message: any): CoreAIMessage => {
    const content = Array.isArray(message.content)
      ? message.content.reduce((acc: string, part: any) => {
          if (part.type === 'text') {
            return acc + part.text
          }
          console.warn('Unsupported Core AI message content type:', part)
          return acc
        }, '')
      : String(message.content ?? '')

    return {
      role: message.role,
      content,
    }
  })
}
