import { generateId } from 'ai'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'

import {
  deleteAttachment,
  type ImageAttachment,
} from '../utils/imageAttachments'
import { atomWithPersistence } from './storage'

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  // What a reasoning model thought before answering
  reasoning?: string
  attachments?: ImageAttachment[]
}

export type Chat = {
  id: string
  title: string
  createdAt: string
  messages: Message[]
}

// The reply being streamed. It lives in memory and is saved to the chat once,
// when the reply ends, instead of rewriting storage on every chunk
export type StreamingReply = {
  chatId: string
  id: string
  content: string
  reasoning: string
}

const chatsAtom = atomWithPersistence<Chat[]>('chats', [])
const currentChatIdAtom = atom<string | null>(null)
const streamingReplyAtom = atom<StreamingReply | null>(null)

export function useChats() {
  const [chats, setChats] = useAtom(chatsAtom)
  const [currentChatId, setCurrentChatId] = useAtom(currentChatIdAtom)

  const currentChat = chats.find((chat) => chat.id === currentChatId) ?? null

  // Adds a message to the chat, starting a new chat when there is none, and
  // returns the chat's ID
  const addMessage = (
    chatId: string | null,
    message: Message,
    title?: string
  ) => {
    const id = chatId ?? generateId()
    setChats((prev) => {
      if (!prev.some((chat) => chat.id === id)) {
        return [
          {
            id,
            title: title ?? (message.content.slice(0, 60) || 'Photo'),
            createdAt: new Date().toISOString(),
            messages: [message],
          },
          ...prev,
        ]
      }
      return prev.map((chat) =>
        chat.id === id
          ? { ...chat, messages: [...chat.messages, message] }
          : chat
      )
    })
    return id
  }

  // Adds a reply to a chat that still exists, so a chat deleted while the
  // reply was generating isn't brought back
  const addReply = (chatId: string, message: Message) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? { ...chat, messages: [...chat.messages, message] }
          : chat
      )
    )
  }

  // Drops the messages after the given one, to regenerate its reply
  const truncateAfter = (chatId: string, messageId: string) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat
        const index = chat.messages.findIndex((m) => m.id === messageId)
        return { ...chat, messages: chat.messages.slice(0, index + 1) }
      })
    )
  }

  // Photos are copied into the app, so they go with their chats
  const deleteAttachments = (removed: Chat[]) => {
    removed
      .flatMap((chat) => chat.messages)
      .flatMap((message) => message.attachments ?? [])
      .forEach(deleteAttachment)
  }

  const deleteChat = (chatId: string) => {
    deleteAttachments(chats.filter((chat) => chat.id === chatId))
    setChats((prev) => prev.filter((chat) => chat.id !== chatId))
    if (chatId === currentChatId) {
      setCurrentChatId(null)
    }
  }

  const deleteAllChats = () => {
    deleteAttachments(chats)
    setChats([])
    setCurrentChatId(null)
  }

  return {
    chats,
    currentChat,
    selectChat: setCurrentChatId,
    addMessage,
    addReply,
    truncateAfter,
    deleteChat,
    deleteAllChats,
  }
}

export function useStreamingReply() {
  return useAtomValue(streamingReplyAtom)
}

export function useSetStreamingReply() {
  return useSetAtom(streamingReplyAtom)
}
