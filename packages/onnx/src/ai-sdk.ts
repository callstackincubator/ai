import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3GenerateResult,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'
import type { PretrainedTokenizerOptions } from '@huggingface/transformers'
import {
  AISDKStorage,
  type DownloadProgress,
  type ModelInfo,
} from '@react-native-ai/common'
import { InferenceSession, Tensor } from 'onnxruntime-react-native'
import { Platform } from 'react-native'
import ReactNativeBlobUtil from 'react-native-blob-util'

import { Tokenizer } from './Tokenizer'

type KVEntry = 'key' | 'value'

const KVCacheConstants = {
  PAST_PREFIX: 'past_key_values',
  PRESENT_PREFIX: 'present',
} as const

type CompletionParams = {
  messages: { role: string; content: string }[]
  temperature?: number
  n_predict?: number
  top_p?: number
  top_k?: number
  response_format?: {
    type: 'json_object'
    schema?: unknown
  }
}

function prepareMessages(
  prompt: LanguageModelV3Prompt
): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = []

  for (const message of prompt) {
    let content = ''

    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text') {
          content += part.text
        }
      }
    } else if (typeof message.content === 'string') {
      content = message.content
    }

    messages.push({
      role: message.role,
      content,
    })
  }

  return messages
}

export interface ONNXModelConfig {
  eosID: bigint
  numKVHeads: number
  hiddenSize: number
  hiddenLayers: number
  numAttentionHeads: number
  KVShape: number[]
}

export type DType = `float${16 | 32}`

export type ONNXLanguageModelOptions = {
  sessionOptions: Partial<InferenceSession.SessionOptions>
  tokenizerOptions: PretrainedTokenizerOptions
  dtype: DType
}

/**
 * onnx-react-native Language Model for AI SDK
 */
export class ONNXLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3'
  readonly supportedUrls = {}
  readonly provider = 'onnx'

  public session: InferenceSession | null = null

  protected modelConfig: ONNXModelConfig | null = null
  protected dtype: DType

  protected _idCounter: number = 0

  public feed: {
    input_ids?: Tensor
    position_ids?: Tensor
    attention_mask?: Tensor
  } & {
    [
      key: `${(typeof KVCacheConstants)[keyof typeof KVCacheConstants]}.${number}.${KVEntry}`
    ]: Tensor
  } = {}

  protected sessionOptions: Partial<InferenceSession.SessionOptions>
  protected tokenizer: Tokenizer

  protected outputTokensBuffer: bigint[] = []

  constructor(
    public readonly modelName: string,
    public readonly modelId: string,
    { sessionOptions, tokenizerOptions, dtype }: ONNXLanguageModelOptions = {
      sessionOptions: {},
      tokenizerOptions: {},
      dtype: 'float16',
    }
  ) {
    this.dtype = dtype
    this.sessionOptions = sessionOptions

    this.tokenizer = new Tokenizer(this.modelName, tokenizerOptions)
  }

  /**
   * Check if model is downloaded
   */
  async isDownloaded(): Promise<boolean> {
    return ONNXEngine.storage.isModelDownloaded(this.modelId)
  }

  /**
   * Download model from HuggingFace
   */
  async download(
    progressCallback?: (progress: DownloadProgress) => void
  ): Promise<void> {
    // await ONNXEngine.storage.downloadModel(this.modelId, progressCallback)

    const { repo } = ONNXEngine.storage.parseModelId(this.modelId)
    const files = this.getModelFiles()
    let progressPerFile = 1 / Object.keys(files).length
    let totalProgress = 0
    try {
      for (const file of Object.values(files)) {
        const path = ONNXEngine.storage.getModelPath(`${repo}/${file}`)
        const url = ONNXEngine.storage.getHFURL(repo, file)
        if (!(await ReactNativeBlobUtil.fs.exists(path))) {
          console.log(`Downloading missing model file from ${url}...`)
          try {
            const res = await ReactNativeBlobUtil.config({
              path,
            })
              .fetch('GET', url)
              .progress((received, total) => {
                const percentage = Math.round(
                  (Number(received) / Number(total)) * 100
                )
                progressCallback?.({
                  percentage: totalProgress + percentage * progressPerFile,
                })
              })

            if (res.info().status > 299) {
              console.error(
                `Failed to download model file from ${url}:`,
                res.info()
              )

              try {
                await ReactNativeBlobUtil.fs.unlink(path)
              } catch {}
            } else {
              totalProgress += progressPerFile * 100
            }
          } catch (e) {
            console.error(
              `Failed to orchestrate download of model file from ${url}:`,
              e
            )
            try {
              const res = await ReactNativeBlobUtil.fetch('GET', url).progress(
                (received, total) => {
                  const percentage = Math.round(
                    (Number(received) / Number(total)) * 100
                  )
                  progressCallback?.({
                    percentage: totalProgress + percentage * progressPerFile,
                  })
                }
              )

              await ReactNativeBlobUtil.fs.writeFile(
                path,
                await res.text(),
                'utf8'
              )

              totalProgress += progressPerFile * 100
            } catch (e) {
              console.error(
                'Failed to download model file via fallback method:',
                e
              )
            }
          }
        }

        console.log(`Checked file exists at path: ${path}`)
      }
    } catch (e) {
      console.error(e)
    }
    try {
      const configJSONPath = ONNXEngine.storage.getModelPath(
        repo + '/' + files.modelConfig
      )
      const configContent = await ReactNativeBlobUtil.fs.readFile(
        configJSONPath,
        'utf8'
      )
      const configJSON = JSON.parse(configContent)
      this.modelConfig = {
        eosID: configJSON.eos_token_id,
        numKVHeads: configJSON.num_key_value_heads,
        hiddenSize: configJSON.hidden_size,
        hiddenLayers: configJSON.num_hidden_layers,
        numAttentionHeads: configJSON.num_attention_heads,
        KVShape: [
          1,
          configJSON.num_key_value_heads ?? 1,
          0,
          configJSON.hidden_size / (configJSON.num_attention_heads ?? 1),
        ],
      }
    } catch (e) {
      console.error('Error reading model config:', e)
    }
  }

  getModelFiles() {
    const { filename } = ONNXEngine.storage.parseModelId(this.modelId)
    const modelConfig = 'config.json'
    const tokenizerConfig = 'tokenizer_config.json'
    const tokenizerJSON = 'tokenizer.json'
    const modelData = `${filename}_data`
    const modelMetadata = filename

    return {
      modelConfig,
      modelData,
      modelMetadata,
      tokenizerConfig,
      tokenizerJSON,
    }
  }

  /**
   * Initialize the model
   */
  async prepare(): Promise<void> {
    if (this.session) {
      return
    }

    const exists = await ONNXEngine.storage.isModelDownloaded(this.modelId)

    if (!exists) {
      throw new Error(
        `Model not downloaded. Call download() first. Model ID: ${this.modelId}`
      )
    }

    const { repo } = ONNXEngine.storage.parseModelId(this.modelId)
    const files = this.getModelFiles()

    try {
      const configJSONPath = ONNXEngine.storage.getModelPath(
        repo + '/' + files.modelConfig
      )
      const configContent = await ReactNativeBlobUtil.fs.readFile(
        configJSONPath,
        'utf8'
      )
      const configJSON = JSON.parse(configContent)
      this.modelConfig = {
        eosID: configJSON.eos_token_id,
        numKVHeads: configJSON.num_key_value_heads,
        hiddenSize: configJSON.hidden_size,
        hiddenLayers: configJSON.num_hidden_layers,
        numAttentionHeads: configJSON.num_attention_heads,
        KVShape: [
          1,
          configJSON.num_key_value_heads ?? 1,
          0,
          configJSON.hidden_size / (configJSON.num_attention_heads ?? 1),
        ],
      }
    } catch (e) {
      console.error('Error reading model config:', e)
    }
    console.log(
      '[onnx] Available providers are:',
      ONNXLanguageModel.getDefaultExecutionProviders()
    )

    const modelMetadataPath = ONNXEngine.storage.getModelPath(
      repo + '/' + files.modelMetadata
    )
    let modelDataPath: string | undefined = ONNXEngine.storage.getModelPath(
      repo + '/' + files.modelData
    )

    if (await ReactNativeBlobUtil.fs.exists(modelDataPath)) {
      console.log('[onnx] External model data found at', modelDataPath)
      modelDataPath = undefined
    }

    // @ts-expect-error
    this.session = await InferenceSession.create(modelMetadataPath, {
      executionProviders: ONNXLanguageModel.getDefaultExecutionProviders(),
      graphOptimizationLevel: 'all',
      externalData: modelDataPath
        ? [
            {
              path: modelDataPath,
            },
          ]
        : undefined,
      ...this.sessionOptions,
      logSeverityLevel: 0,
    })
    console.log('[onnx] Model session created')

    // initialize KV cache tensors
    this.reinitializeKVCache()

    console.log('[onnx] Preparing tokenizer')
    await this.tokenizer.prepare()
    console.log('[onnx] Model is ready')
  }

  // implementation of KV cache heavily inspired by https://github.com/daviddaytw/react-native-transformers/blob/main/src/models/base.tsx
  protected reinitializeKVCache() {
    if (!this.modelConfig) {
      throw new Error('Model not prepared. Call prepare() first.')
    }

    // dispose() tensors of the current cache
    for (const V of Object.values(this.feed)) {
      if (V?.location === 'gpu-buffer') {
        V.dispose()
      }
    }
    // clear the cache
    this.feed = {}

    // prefill the cache with empty tensors
    const empty = this.dtype === 'float16' ? new Uint16Array() : []
    for (let i = 0; i < this.modelConfig.hiddenLayers; i++) {
      for (const KVKey of ['key', 'value'] as KVEntry[]) {
        this.feed[`${KVCacheConstants.PAST_PREFIX}.${i}.${KVKey}`] = new Tensor(
          this.dtype,
          empty,
          this.modelConfig.KVShape
        )
      }
    }
    this.outputTokensBuffer = []
  }

  protected updateKVCache(outputs: InferenceSession.OnnxValueMapType) {
    for (const name in outputs) {
      if (name.startsWith(KVCacheConstants.PRESENT_PREFIX)) {
        const newName = name.replace(
          KVCacheConstants.PRESENT_PREFIX,
          KVCacheConstants.PAST_PREFIX
        ) as keyof typeof this.feed

        // dispose previous gpu buffers
        const t = this.feed[newName]
        // TODO: check if also need to dispose ml-tensor and/or texture?
        if (t?.location === 'gpu-buffer') {
          t.dispose()
        }

        const outputTensor = outputs[name]
        if (outputTensor) {
          this.feed[newName] = outputTensor
        }
      }
    }
  }

  // implementation of argmax courtesy of https://github.com/daviddaytw/react-native-transformers/blob/main/src/models/base.tsx
  protected argmax(t: Tensor): number {
    const arr = t.data
    const [batch, seqLen, vocabSize] = t.dims!

    if (!batch || !seqLen || !vocabSize) throw new Error('Invalid tensor dims')

    // Use logits for the last token in the sequence
    const offset = vocabSize * (seqLen - 1)
    let maxIndex = 0
    let maxValue = arr[offset]

    for (let i = 1; i < vocabSize; i++) {
      const val = arr[offset + i]
      if (!isFinite(val as number)) throw new Error('Infinite value in logits')
      if (val > maxValue) {
        maxValue = val
        maxIndex = i
      }
    }

    return maxIndex
  }

  static getDefaultExecutionProviders(): InferenceSession.ExecutionProviderConfig[] {
    return [...(Platform.OS === 'ios' ? ['coreml'] : ['nnapi']), 'cpu']
  }

  /**
   * Get the underlying session (for advanced usage)
   */
  getContext(): InferenceSession | null {
    return this.session
  }

  /**
   * Unload model from memory
   */
  async unload(): Promise<void> {
    if (this.session) {
      await this.session.release()
      this.session = null
    }
  }

  /**
   * Remove model from disk
   */
  async remove(): Promise<void> {
    await this.unload()
    await ONNXEngine.storage.removeModel(this.modelId)
  }

  protected async runInference(
    completionOptions: Partial<CompletionParams>,
    tokens: bigint[],
    callback?: (newToken: bigint, outputTokensBuffer: bigint[]) => void,
    isCancelled?: boolean
  ) {
    // clear the KV cache and output buffer for new inference
    this.reinitializeKVCache()
    this.outputTokensBuffer = []

    const initialTokens = BigInt64Array.from(tokens.map(BigInt))
    const inputIdsTensor = new Tensor('int64', initialTokens, [
      1,
      tokens.length,
    ])
    this.feed.input_ids = inputIdsTensor

    this.outputTokensBuffer.push(...inputIdsTensor.data)

    let lastToken = 0n
    let sequenceLength = this.outputTokensBuffer.length
    const initialLength = this.feed.input_ids.size

    this.feed.position_ids = new Tensor(
      'int64',
      BigInt64Array.from({ length: initialLength }, (_, i) =>
        BigInt(sequenceLength - initialLength + i)
      ),
      [1, initialLength]
    )

    console.log('Starting generation loop...', this.session?.inputNames)

    while (
      lastToken !== this.modelConfig!.eosID &&
      isCancelled !== true &&
      // lastToken !== 32007n && TODO: why this hardcoded EOS token? We have one from the config -> to be checked
      sequenceLength < 14 // TODO: (completionOptions.n_predict ?? Infinity)
    ) {
      try {
        console.log('Generating token at sequence length:', sequenceLength)

        // For incremental generation, attention_mask should match only the new token (length 1)
        // and use past KV cache to handle previous tokens
        this.feed.attention_mask = new Tensor(
          'int64',
          BigInt64Array.from([1n]),
          [1, this.outputTokensBuffer.length]
        )

        // TODO: see what keys are in outputs, aggregate stats to return from this function
        const outputs = await this.session!.run(this.feed)

        lastToken = BigInt(this.argmax(outputs.logits!))
        this.outputTokensBuffer.push(lastToken)

        console.log('Generated token ID:', lastToken.toString())

        callback?.(lastToken, this.outputTokensBuffer)
        let a = this.tokenizer.detokenize(
          this.outputTokensBuffer,
          initialTokens.length
        )
        console.log('ARTUR', a, typeof a)
        this.updateKVCache(outputs)

        // For incremental generation, input_ids and position_ids are just the last token
        this.feed.input_ids = new Tensor(
          'int64',
          BigInt64Array.from([lastToken]),
          [1, 1]
        )

        this.feed['position_ids'] = new Tensor(
          'int64',
          BigInt64Array.from([BigInt(sequenceLength)]),
          [1, 1]
        )

        // Update sequence length for next iteration
        sequenceLength = this.outputTokensBuffer.length
      } catch (e) {
        console.error('Error during inference step:', e)
        break
      }
    }

    return {
      // TODO: implement this
    }
  }

  /**
   * Non-streaming text generation (AI SDK LanguageModelV3)
   */
  async doGenerate(options: LanguageModelV3CallOptions) {
    if (!this.session) {
      console.log(
        'Model not prepared. Calling prepare() now, but you should do this beforehand for better performance.'
      )
      await this.prepare()
    }

    const messages = prepareMessages(options.prompt)

    const completionOptions: Partial<CompletionParams> = {
      messages,
      temperature: options.temperature,
      n_predict: options.maxOutputTokens,
      top_p: options.topP,
      top_k: options.topK,
    }

    console.log('[onnx] Generating text (non-streaming)')

    const inputTokens = this.tokenizer.tokenize(messages.join('\n'))

    const outputInfo = await this.runInference(completionOptions, inputTokens)
    const outputIndex = this.outputTokensBuffer.length + inputTokens.length

    let textContent = this.tokenizer.detokenize(
      this.outputTokensBuffer,
      outputIndex
    )

    console.log('[onnx] Generation complete:', {
      contentLength: textContent.length,
      finishReason: 'stop',
    })

    return {
      content: [
        {
          type: 'text',
          text: textContent,
        },
        {
          type: 'reasoning',
          // TODO: from outputInfo -> text: response.reasoning_content,
        },
      ] as LanguageModelV3Content[],
      finishReason: {
        raw: 'stop',
        unified: 'stop',
      },
      usage: {
        inputTokens: {
          cacheRead: undefined,
          cacheWrite: undefined,
          noCache: undefined,
          total: undefined,
        },
        outputTokens: {
          reasoning: undefined,
          text: undefined,
          total: undefined,
        },
        // TODO: from outputInfo -> inputTokens: response.timings?.prompt_n || 0,
        // TODO: from outputInfo -> outputTokens: response.timings?.predicted_n || 0,
        // TODO: from outputInfo -> totalTokens:
        // (response.timings?.prompt_n || 0) +
        // (response.timings?.predicted_n || 0),
      },
      warnings: [],
    } as LanguageModelV3GenerateResult
  }

  generateId() {
    return this._idCounter++
  }

  /**
   * Streaming text generation (AI SDK LanguageModelV3)
   */
  async doStream(options: LanguageModelV3CallOptions) {
    if (!this.session) {
      console.log(
        'Model not prepared. Calling prepare() now, but you should do this beforehand for better performance.'
      )
      await this.prepare()
    }

    const messages = prepareMessages(options.prompt)

    const completionOptions: Partial<CompletionParams> = {
      messages,
      temperature: options.temperature,
      n_predict: options.maxOutputTokens,
      top_p: options.topP,
      top_k: options.topK,
    }

    console.log('[onnx] Generating streaming generation')

    const inputTokens = this.tokenizer.tokenize(messages.join('\n'))
    console.log({ inputTokens })

    let streamFinished = false
    let isCancelled = false

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start: async (controller) => {
        try {
          let textId = this.generateId().toString()

          controller.enqueue({
            type: 'stream-start',
            warnings: [],
          })

          controller.enqueue({
            type: 'text-start',
            id: textId,
          })

          const outputInfo = await this.runInference(
            completionOptions,
            inputTokens,
            (newToken, allTokens) => {
              console.log([newToken], allTokens)
              controller.enqueue({
                type: 'text-delta',
                id: textId,
                // delta: this.tokenizer.detokenize([newToken], 1),
                delta: this.tokenizer.detokenize(allTokens, inputTokens.length),
              })
            },
            isCancelled
          )

          controller.enqueue({
            type: 'text-end',
            id: textId,
          })

          streamFinished = true

          controller.close()
          console.log('[onnx] Streaming complete')
        } catch (e) {
          console.error('[onnx] Error during streaming inference:', e)

          if (!isCancelled && !streamFinished) {
            try {
              controller.error(e)
            } catch (err) {
              console.error('[onnx] Error reporting error:', err)
            }
          }
        }
      },
      cancel: async () => {
        console.log('[onnx] Stream cancelled')
        isCancelled = true
        streamFinished = true
        try {
          this.reinitializeKVCache()
        } catch (error) {
          console.error('[onnx] Error stopping completion:', error)
        }
      },
    })

    return {
      stream,
    }
  }
}

/**
 * Engine for managing onnx models (similar to MLCEngine)
 */
export class ONNXEngine {
  static storage = new AISDKStorage('onnx', 'onnx')

  /**
   * Get all downloaded models
   */
  static async getModels(): Promise<ModelInfo[]> {
    return ONNXEngine.storage.getDownloadedModels()
  }

  /**
   * Check if a specific model is downloaded
   */
  static async isDownloaded(modelId: string): Promise<boolean> {
    return ONNXEngine.storage.isModelDownloaded(modelId)
  }

  /**
   * Set custom storage path for models
   * Default: ${DocumentDir}/onnx-models/
   */
  static setStoragePath(path: string): void {
    ONNXEngine.storage.setStoragePath(path)
  }
}

/**
 * onnx-react-native provider factory
 */
export const onnx = {
  /**
   * Create a language model instance
   */
  languageModel: (
    modelId: string,
    options: ONNXLanguageModelOptions = {
      sessionOptions: {},
      tokenizerOptions: {},
      dtype: 'float16',
    }
  ): ONNXLanguageModel => {
    return new ONNXLanguageModel(modelId, modelId, options)
  },
}
