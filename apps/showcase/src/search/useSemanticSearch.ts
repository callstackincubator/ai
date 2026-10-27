import { apple } from '@react-native-ai/apple'
import { cosineSimilarity, embed, embedMany, generateId } from 'ai'
import { File, Paths } from 'expo-file-system'
import { atom, useAtom } from 'jotai'
import { useEffect, useState } from 'react'

import { isSimulator } from '../simulator'
import { atomWithPersistence } from '../store/storage'
import { KeywordEmbeddingModel } from './keywordEmbeddingModel'
import sampleNotes from './sampleNotes.json'

export type Note = { id: string; text: string }
export type SearchResult = Note & { score: number }

type Vectors = Record<string, { text: string; embedding: number[] }>

const embeddingModel = isSimulator
  ? new KeywordEmbeddingModel()
  : apple.embeddingModel()
// Vectors are cached on disk per model, so notes are embedded once
const cacheFile = new File(
  Paths.document,
  `note-embeddings-${embeddingModel.modelId}.json`
)

const userNotesAtom = atomWithPersistence<Note[]>('userNotes', [])
const vectorsAtom = atom<Vectors | null>(null)

function readCache(): Vectors {
  try {
    return cacheFile.exists ? JSON.parse(cacheFile.textSync()) : {}
  } catch {
    return {}
  }
}

export function useUserNotes() {
  return useAtom(userNotesAtom)
}

export function useSemanticSearch(query: string) {
  const [userNotes, setUserNotes] = useAtom(userNotesAtom)
  const [vectors, setVectors] = useAtom(vectorsAtom)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const notes: Note[] = [...userNotes, ...sampleNotes]

  // Embeds the notes that have no vector yet
  useEffect(() => {
    const cached = vectors ?? readCache()
    const missing = notes.filter((note) => cached[note.id]?.text !== note.text)
    if (vectors && missing.length === 0) return

    let cancelled = false
    ;(async () => {
      try {
        const next = { ...cached }
        if (missing.length > 0) {
          await embeddingModel.prepare()
          const { embeddings } = await embedMany({
            model: embeddingModel,
            values: missing.map((note) => note.text),
          })
          missing.forEach((note, index) => {
            next[note.id] = { text: note.text, embedding: embeddings[index] }
          })
          cacheFile.write(JSON.stringify(next))
        }
        if (!cancelled) setVectors(next)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  })

  // Ranks the notes by how close their meaning is to the query
  useEffect(() => {
    const text = query.trim()
    if (!vectors || !text) return

    let cancelled = false
    const timeout = setTimeout(async () => {
      try {
        const { embedding } = await embed({
          model: embeddingModel,
          value: text,
        })
        if (cancelled) return
        setResults(
          [...userNotes, ...sampleNotes]
            .filter((note) => vectors[note.id])
            .map((note) => ({
              ...note,
              score: cosineSimilarity(embedding, vectors[note.id].embedding),
            }))
            // Notes that share nothing with the query are left out
            .filter((note) => note.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 12)
        )
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query, vectors, userNotes])

  const addNote = (text: string) => {
    setUserNotes((prev) => [{ id: generateId(), text }, ...prev])
  }

  const deleteNote = (id: string) => {
    setUserNotes((prev) => prev.filter((note) => note.id !== id))
  }

  return {
    notes,
    // Results only apply while there is a query
    results: query.trim() ? results : null,
    isIndexing: vectors === null && error === null,
    error,
    addNote,
    deleteNote,
  }
}
