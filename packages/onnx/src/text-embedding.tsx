import 'text-encoding-polyfill';

import { Tensor } from 'onnxruntime-react-native';
import { ONNXLanguageModel } from './ai-sdk';

/**
 * Class to handle text embedding model on top of onnxruntime
 */
export class TextEmbedding extends ONNXLanguageModel {
  /**
   * Generate embeddings from input tokens
   *
   * @param tokens Input tokens to generate embeddings from
   * @returns Float32Array containing the embedding vector
   */
  public async embed(tokens: bigint[]): Promise<Float32Array> {
    const KVCacheTensors = this.KVCacheTensors;
    const inputIdsTensor = new Tensor(
      'int64',
      BigInt64Array.from(tokens.map(BigInt)),
      [1, tokens.length]
    );
    KVCacheTensors.input_ids = inputIdsTensor;

    // Create attention mask (1 for all tokens)
    KVCacheTensors.attention_mask = new Tensor(
      'int64',
      BigInt64Array.from({ length: tokens.length }, () => 1n),
      [1, tokens.length]
    );

    if (!this.session) {
      throw new Error('Session is undefined');
    }

    // Run inference to get embeddings
    const outputs = await this.session.run(KVCacheTensors);

    // The model typically outputs the embeddings as 'last_hidden_state' or 'embeddings'
    // We take the mean of the token embeddings to get a single vector
    const embeddings = outputs.last_hidden_state || outputs.embeddings;

    if (!embeddings) {
      throw new Error('No embedding output found in model outputs');
    }

    // Calculate mean across token dimension (dim 1) to get a single embedding vector
    const data = embeddings.data as Float32Array;
    const [, seqLen, hiddenSize] = embeddings.dims;

    if (!seqLen || !hiddenSize || !data) {
      throw new Error('Invalid embedding dimensions or data');
    }

    const result = new Float32Array(hiddenSize);

    for (let h = 0; h < hiddenSize; h++) {
      let sum = 0;
      for (let s = 0; s < seqLen; s++) {
        const index = s * hiddenSize + h;
        if (data[index] !== undefined) {
          sum += data[index];
        }
      }
      result[h] = sum / seqLen;
    }

    return result;
  }
}
