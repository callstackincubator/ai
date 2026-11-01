import { android } from '@react-native-ai/android'
import { cosineSimilarity, embedMany } from 'ai'
import { describe, expect, it } from 'react-native-harness'

const model = android.embeddingModel({ taskType: 'semanticSimilarity' })

describe('android embeddings', () => {
  it('reports the embedding model', async () => {
    const info = await model.getModelInfo()
    console.log('[android] embedding model:', JSON.stringify(info))

    expect(info.availability).not.toBe('unknown')
  })

  it('embeds similar sentences closer together', async () => {
    await model.prepare({ onProgress: () => {} })

    const { embeddings } = await embedMany({
      model,
      values: [
        'The cat sleeps on the sofa.',
        'A kitten naps on the couch.',
        'Stock markets fell sharply today.',
      ],
    })

    expect(embeddings[0]!.length).toBeGreaterThan(0)
    expect(cosineSimilarity(embeddings[0]!, embeddings[1]!)).toBeGreaterThan(
      cosineSimilarity(embeddings[0]!, embeddings[2]!)
    )
  })
})
