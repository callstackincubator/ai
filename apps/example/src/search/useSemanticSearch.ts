import { apple } from '@react-native-ai/apple'
import { cosineSimilarity, embed, embedMany, generateId } from 'ai'
import { File, Paths } from 'expo-file-system'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
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

// Deletes notes along with their cached vectors, which hold the note's text
function useDeleteNotes() {
  const setUserNotes = useSetAtom(userNotesAtom)
  const [vectors, setVectors] = useAtom(vectorsAtom)

  return (ids: string[]) => {
    setUserNotes((prev) => prev.filter((note) => !ids.includes(note.id)))
    const next = { ...(vectors ?? readCache()) }
    ids.forEach((id) => delete next[id])
    cacheFile.write(JSON.stringify(next))
    if (vectors) setVectors(next)
  }
}

export function useUserNotes() {
  const userNotes = useAtomValue(userNotesAtom)
  const deleteNotes = useDeleteNotes()
  return {
    userNotes,
    deleteAllNotes: () => deleteNotes(userNotes.map((note) => note.id)),
  }
}

export function useSemanticSearch(query: string) {
  const [userNotes, setUserNotes] = useAtom(userNotesAtom)
  const [vectors, setVectors] = useAtom(vectorsAtom)
  const deleteNotes = useDeleteNotes()
  // Tagged with the query that produced them, so results for an older query
  // are not shown while a newer one is embedded
  const [results, setResults] = useState<{
    query: string
    notes: Note[]
    items: SearchResult[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const notes: Note[] = [...userNotes, ...sampleNotes]

  // Embeds the notes that have no vector yet. It depends on the notes and
  // vectors only, so typing a query doesn't start another batch
  useEffect(() => {
    const cached = vectors ?? readCache()
    const missing = [...userNotes, ...sampleNotes].filter(
      (note) => cached[note.id]?.text !== note.text
    )
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
          // Notes deleted meanwhile cancel this batch, so it can't write them back
          if (cancelled) return
          cacheFile.write(JSON.stringify(next))
        }
        if (!cancelled) {
          setVectors(next)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userNotes, vectors, setVectors])

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
        setResults({
          query: text,
          notes: userNotes,
          items: [...userNotes, ...sampleNotes]
            .filter((note) => vectors[note.id])
            .map((note) => ({
              ...note,
              score: cosineSimilarity(embedding, vectors[note.id].embedding),
            }))
            // Notes that share nothing with the query are left out
            .filter((note) => note.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 12),
        })
        setError(null)
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

  const deleteNote = (id: string) => deleteNotes([id])

  return {
    notes,
    // Results only apply to the current query and notes, so a deleted note
    // isn't shown or sent to Chat
    results:
      results && results.query === query.trim() && results.notes === userNotes
        ? results.items
        : null,
    isIndexing: vectors === null && error === null,
    error,
    addNote,
    deleteNote,
  }
}
