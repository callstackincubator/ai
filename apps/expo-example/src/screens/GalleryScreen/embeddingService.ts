/**
 * Embedding service for semantic search.
 * Uses NCNN multimodal (CLIP) model when available via initEmbeddingModel().
 * Fallback: hash-based placeholder for demo flow.
 */
import { loadModel, type Model } from '@react-native-ai/ncnn-wrapper'

const EMBEDDING_DIM = 384

let embeddingModel: Model | null = null

export function getEmbeddingDimension(): number {
  return EMBEDDING_DIM
}

export function isModelLoaded(): boolean {
  return embeddingModel !== null
}

/**
 * Initialize the embedding model. Call with paths to CLIP NCNN model files.
 */
export async function initEmbeddingModel(
  paramPath: string,
  binPath: string
): Promise<boolean> {
  try {
    embeddingModel = loadModel(paramPath, binPath)
    return embeddingModel !== null
  } catch {
    return false
  }
}

/**
 * Produce embedding vector for an image.
 * With CLIP: use react-native-nitro-image toRawPixelData() + rgbBytesToFloatTensor.
 * Fallback: hash-based vector for demo.
 */
export async function embedImage(uri: string): Promise<Float32Array> {
  return hashToVector(uri, EMBEDDING_DIM)
}

/**
 * Produce embedding vector for text.
 * With CLIP: expects tokenized input. Fallback: hash-based for demo.
 */
export function embedText(text: string): Float32Array {
  if (embeddingModel) {
    try {
      const tokens = text.split('').map((c) => c.charCodeAt(0) % 49408)
      while (tokens.length < 77) tokens.push(0)
      const result = embeddingModel.runInference(tokens, {
        inputBlob: 'input_ids',
        outputBlob: 'output',
      })
      if (result.output && result.output.length >= EMBEDDING_DIM) {
        return new Float32Array(result.output.slice(0, EMBEDDING_DIM))
      }
    } catch (e) {
      console.warn('NCNN text embedding failed:', e)
    }
  }
  return hashToVector(text, EMBEDDING_DIM)
}

function hashToVector(seed: string, dim: number): Float32Array {
  const vec = new Float32Array(dim)
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i)
    h |= 0
  }
  for (let i = 0; i < dim; i++) {
    h = (h * 1103515245 + 12345) >>> 0
    vec[i] = (h / 0xffffffff) * 2 - 1
  }
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < vec.length; i++) vec[i] /= norm
  return vec
}
