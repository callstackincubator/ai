import { env, AutoTokenizer } from '@huggingface/transformers'
import type { PreTrainedTokenizer } from '@huggingface/transformers'
import { TextEmbedding } from '../text-embedding'
import type { LoadOptions } from '../ai-sdk'

/** Initialization Options for Text Embedding */
export interface TextEmbeddingOptions extends LoadOptions {
  /** Shows special tokens in the output. */
  show_special: boolean
}

// Set up environment for transformers.js tokenizer
env.allowRemoteModels = true
env.allowLocalModels = false

// Declare tokenizer and model
let tokenizer: PreTrainedTokenizer
let model: TextEmbedding | null = null

// Initialize options with default values
let _options: TextEmbeddingOptions = {
  show_special: false,
  max_tokens: 512, // typical max length for embedding models
  fetch: async (url) => url,
  verbose: false,
  externalData: false,
  executionProviders: ['cpu'],
}

/**
 * Generates embeddings from the input text.
 *
 * @param text - The input text to generate embeddings from.
 * @returns Float32Array containing the embedding vector.
 */
async function embed(text: string): Promise<Float32Array> {
  if (!tokenizer || !model) {
    throw new Error('Tokenizer undefined, please initialize first.')
  }

  const { input_ids } = await tokenizer(text, {
    return_tensor: false,
    padding: true,
    truncation: true,
    max_length: _options.max_tokens,
  })

  return await model.embed(input_ids.map(BigInt))
}

/**
 * Loads the model and tokenizer with the specified options.
 *
 * @param model_name - The name of the model to load.
 * @param onnx_path - The path to the ONNX model.
 * @param options - Optional initialization options.
 */
async function init(
  model_name: string,
  onnx_path: string,
  options?: Partial<TextEmbeddingOptions>
): Promise<void> {
  _options = { ..._options, ...options }
  model = new TextEmbedding(model_name, model_name, 'float16', {
    sessionOptions: {},
    tokenizerOptions: {},
  })
  tokenizer = await AutoTokenizer.from_pretrained(model_name)
  await model.load(model_name, onnx_path, _options)
}

/**
 * Releases the resources used by the model.
 */
async function release(): Promise<void> {
  if (model) {
    await model.release()
  }
}

// Export functions for external use
export default { init, embed, release }
