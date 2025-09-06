import { ModelMessage } from 'ai'
import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'

import { atomWithSecureStorage } from '../utils/jotai'

export interface Conversation {
  id: string
  title: string
  messages: ModelMessage[]
  createdAt: number
  updatedAt: number
}

export const conversationsAtom = atomWithSecureStorage<
  Record<string, Conversation>
>('conversations-v2', {})

export const conversationAtom = atomFamily((conversationId?: string) =>
  atom(
    (get) => {
      const conversations = get(conversationsAtom)
      if (conversationId && conversations[conversationId]) {
        return conversations[conversationId]
      }
      return null
    },
    (get, set, id: string, payload: Partial<Conversation>) => {
      const conversations = get(conversationsAtom)
      set(conversationsAtom, {
        ...conversations,
        [id]: {
          ...conversations[id],
          ...payload,
          updatedAt: Date.now(),
        },
      })
    }
  )
)
