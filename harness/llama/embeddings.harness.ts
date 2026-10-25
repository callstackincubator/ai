import { downloadModel, llama } from '@react-native-ai/llama'
import { embedMany } from 'ai'
import { describe, expect, it } from 'react-native-harness'

const EMBEDDING_MODEL_ID =
  'nomic-ai/nomic-embed-text-v1.5-GGUF/nomic-embed-text-v1.5.Q4_K_M.gguf'

describe('llama embedding model', () => {
  it('embeds one call at a time and counts tokens', async () => {
    const embeddingModel = llama.embeddingModel(
      await downloadModel(EMBEDDING_MODEL_ID)
    )

    const result = await embedMany({
      model: embeddingModel,
      values: ['a cat', 'a dog sat', 'a bird flew', 'a fish swam'],
      maxParallelCalls: 4,
    })

    expect(result.embeddings).toHaveLength(4)
    expect(result.embeddings[0].length).toBeGreaterThan(0)
    expect(result.usage.tokens).toBeGreaterThan(0)

    await embeddingModel.unload()
  })
})
