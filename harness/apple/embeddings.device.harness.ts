import { apple } from '@react-native-ai/apple'
import { embed, embedMany } from 'ai'
import { describe, expect, it } from 'react-native-harness'

// Simulators cannot download the NLContextualEmbedding assets

function cosine(a: number[], b: number[]) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / Math.sqrt(normA * normB)
}

describe('apple embeddings', () => {
  it('embeds text so that similar texts are closer', async () => {
    const model = apple.embeddingModel({ language: 'en' })
    await model.prepare()

    const { embeddings } = await embedMany({
      model,
      values: [
        'a cat sat on the mat',
        'a kitten lay on the rug',
        'quarterly tax returns are due',
      ],
    })

    expect(embeddings).toHaveLength(3)
    expect(cosine(embeddings[0], embeddings[1])).toBeGreaterThan(
      cosine(embeddings[0], embeddings[2])
    )
  })

  it('returns a zero vector for text without tokens', async () => {
    const model = apple.embeddingModel({ language: 'en' })
    const { embedding: reference } = await embed({ model, value: 'hello' })

    for (const value of ['', '   ']) {
      const { embedding } = await embed({ model, value })

      expect(embedding).toHaveLength(reference.length)
      expect(embedding.every((n) => n === 0)).toBe(true)
    }
  })
})
