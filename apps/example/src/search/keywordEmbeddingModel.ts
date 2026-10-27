import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  EmbeddingModelV4Result,
} from '@ai-sdk/provider'

const DIMENSIONS = 4096

// FNV-1a, which spreads words across all slots
function hash(word: string) {
  let value = 0x811c9dc5
  for (const char of word) {
    value = Math.imul(value ^ char.charCodeAt(0), 0x01000193)
  }
  return (value >>> 0) % DIMENSIONS
}

// Stands in for Apple embeddings in the Simulator: a bag of words, so it
// matches shared words rather than meaning
export class KeywordEmbeddingModel implements EmbeddingModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'simulator'
  // Part of the cache file name, so it changes with the hash or DIMENSIONS
  readonly modelId = `keywords-fnv-${DIMENSIONS}`
  readonly maxEmbeddingsPerCall = Infinity
  readonly supportsParallelCalls = true

  async prepare() {}

  async doEmbed({
    values,
  }: EmbeddingModelV4CallOptions): Promise<EmbeddingModelV4Result> {
    const embeddings = values.map((text) => {
      const vector = new Array<number>(DIMENSIONS).fill(0)
      for (const word of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
        // A crude stem, so "tires" matches "tire"
        vector[hash(word.replace(/(ing|es|s)$/, ''))] += 1
      }
      return vector
    })
    return { embeddings, warnings: [] }
  }
}
