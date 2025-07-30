import { apple } from '@react-native-ai/apple'
import { cosineSimilarity, embedMany } from 'ai'

export interface EmbeddedChunk {
  text: string
  embedding: number[]
  chunkIndex: number
  documentId: string
  estimatedTokens: number
}

let documents: EmbeddedChunk[] = []

const estimatedCharsPerToken = 4

/**
 * Create overlapping text chunks optimized for Apple embeddings (256 token limit)
 * with an overlap of 25 tokens
 */
export const createOverlappingChunks = (
  text: string,
  chunkSize: number = 256,
  overlapSize: number = 25
): string[] => {
  const overlapChars = overlapSize * estimatedCharsPerToken
  const chunkChars = chunkSize * estimatedCharsPerToken - overlapChars * 2

  const chunks: string[] = []

  for (let i = 0; i < text.length; i += chunkChars) {
    const start = Math.max(i - overlapChars, 0)
    const end = Math.min(i + chunkChars + overlapChars, text.length)
    chunks.push(text.slice(start, end))
  }

  return chunks
}

/**
 * Process text into embedded chunks and store them
 */
export const createEmbeddings = async (
  text: string
): Promise<EmbeddedChunk[]> => {
  const cleanText = text.replace(/\s+/g, ' ').trim()
  const chunks = createOverlappingChunks(cleanText, 220, 25)

  const { embeddings } = await embedMany({
    model: apple.textEmbeddingModel(),
    values: chunks,
  })

  const newDocuments = chunks.map((chunk, index) => ({
    text: chunk,
    embedding: embeddings[index],
    chunkIndex: index,
    documentId: Date.now().toString(),
    estimatedTokens: Math.ceil(chunk.length / 4),
  }))

  documents.push(...newDocuments)

  return newDocuments
}

/**
 * Search for relevant chunks using semantic similarity
 */
export const searchRelevantChunks = async (query: string, topK: number = 3) => {
  if (documents.length === 0) {
    return []
  }

  const { embeddings: queryEmbeddings } = await embedMany({
    model: apple.textEmbeddingModel(),
    values: [query],
  })

  const queryEmbedding = queryEmbeddings[0]
  const similarities = documents.map((doc) => ({
    ...doc,
    similarity: cosineSimilarity(queryEmbedding, doc.embedding),
  }))

  return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, topK)
}
