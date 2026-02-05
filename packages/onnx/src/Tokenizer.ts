import {
  AutoTokenizer,
  env,
  PreTrainedTokenizer,
  type PretrainedTokenizerOptions,
} from '@huggingface/transformers'
import ReactNativeBlobUtil from 'react-native-blob-util'

import { ONNXEngine } from './ai-sdk'

// huggingface transformers env configuration
env.allowLocalModels = true
env.allowRemoteModels = true

export class Tokenizer {
  protected tokenizer: PreTrainedTokenizer | null = null

  constructor(
    public readonly modelName: string,
    protected tokenizerOptions: PretrainedTokenizerOptions
  ) {}

  async prepare() {
    try {
      const { repo } = ONNXEngine.storage.parseModelId(this.modelName)
      console.log(`[onnx] Preparing tokenizer for model ${this.modelName}`)
      // this.tokenizer = await AutoTokenizer.from_pretrained(
      //   'file://' + ONNXEngine.storage.getModelPath(this.modelName),
      //   this.tokenizerOptions
      // )

      const tokenizerJSONPath = ONNXEngine.storage.getModelPath(
        repo + '/tokenizer.json'
      )
      const tokenizerJSONText = await ReactNativeBlobUtil.fs.readFile(
        tokenizerJSONPath,
        'utf8'
      )
      const tokenizerJSON = JSON.parse(tokenizerJSONText)

      const tokenizerConfigPath = ONNXEngine.storage.getModelPath(
        repo + '/tokenizer_config.json'
      )
      const tokenizerConfigText = await ReactNativeBlobUtil.fs.readFile(
        tokenizerConfigPath,
        'utf8'
      )
      const tokenizerConfig = JSON.parse(tokenizerConfigText)

      // Some tokenizers are saved with the "Fast" suffix, so we remove that if present.
      const tokenizerName =
        tokenizerConfig.tokenizer_class?.replace(/Fast$/, '') ??
        'PreTrainedTokenizer'

      // @ts-expect-error
      let clazz = AutoTokenizer.TOKENIZER_CLASS_MAPPING[tokenizerName]
      if (!clazz) {
        console.warn(
          `Unknown tokenizer class "${tokenizerName}", attempting to construct from base class.`
        )
        clazz = PreTrainedTokenizer
      }
      console.log(`[onnx] Initializing tokenizer of class ${clazz.name}`)
      this.tokenizer = new clazz(tokenizerJSON, tokenizerConfig)
      console.log(`[onnx] Tokenizer for model ${this.modelName} is ready.`)
    } catch (e) {
      console.error(e)
    }
  }

  tokenize(prompt: string) {
    if (!this.tokenizer) {
      throw new Error('Tokenizer is not initialized, call prepare() first.')
    }

    return this.tokenizer(prompt, {
      return_tensor: false,
      padding: true,
      truncation: true,
    }).input_ids.map(BigInt) as bigint[]
  }

  detokenize(tokens: bigint[], start: number): string {
    if (!this.tokenizer) {
      throw new Error('Tokenizer is not initialized, call prepare() first.')
    }

    return this.tokenizer.decode(tokens.slice(start) as unknown as number[], {
      skip_special_tokens: true,
    })
  }
}
