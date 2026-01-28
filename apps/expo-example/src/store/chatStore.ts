import { atom, useAtom, useSetAtom } from 'jotai'
import { useCallback } from 'react'

export type MessageRole = 'user' | 'assistant'

export type Message = {
  id: string
  role: MessageRole
  content: string
  createdAt: Date
}

export type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

export type CustomModel = {
  id: string
  name: string
  url: string
}

const chatsAtom = atom<Chat[]>([])
const currentChatIdAtom = atom<string | null>(null)
const selectedModelIdAtom = atom<string>('builtin-0')
const customModelsAtom = atom<CustomModel[]>([])

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`

export function useChatStore() {
  const [chats, setChats] = useAtom(chatsAtom)
  const [currentChatId, setCurrentChatId] = useAtom(currentChatIdAtom)
  const [selectedModelId, setSelectedModelId] = useAtom(selectedModelIdAtom)
  const [customModels, setCustomModels] = useAtom(customModelsAtom)

  const createNewChat = useCallback(() => {
    const newChat: Chat = {
      id: createId(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
    }
    setChats((prev) => [newChat, ...prev])
    setCurrentChatId(newChat.id)
    return newChat.id
  }, [setChats, setCurrentChatId])

  const selectChat = useCallback(
    (id: string) => {
      setCurrentChatId(id)
    },
    [setCurrentChatId]
  )

  const deleteChat = useCallback(
    (id: string) => {
      setChats((prev) => {
        const next = prev.filter((chat) => chat.id !== id)
        if (currentChatId === id) {
          setCurrentChatId(next[0]?.id ?? null)
        }
        return next
      })
    },
    [currentChatId, setChats, setCurrentChatId]
  )

  const addMessage = useCallback(
    (message: Omit<Message, 'id' | 'createdAt'>) => {
      const chatId = currentChatId ?? createId()
      const newMessage: Message = {
        ...message,
        id: createId(),
        createdAt: new Date(),
      }

      setChats((prev) => {
        if (!currentChatId) {
          const newChat: Chat = {
            id: chatId,
            title:
              message.role === 'user'
                ? `${message.content.slice(0, 30)}${
                    message.content.length > 30 ? '...' : ''
                  }`
                : 'New Chat',
            messages: [newMessage],
            createdAt: new Date(),
          }
          return [newChat, ...prev]
        }

        return prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, newMessage],
                title:
                  chat.messages.length === 0 && message.role === 'user'
                    ? `${message.content.slice(0, 30)}${
                        message.content.length > 30 ? '...' : ''
                      }`
                    : chat.title,
              }
            : chat
        )
      })

      if (!currentChatId) {
        setCurrentChatId(chatId)
      }

      return { chatId, messageId: newMessage.id }
    },
    [currentChatId, setChats, setCurrentChatId]
  )

  const updateMessageContent = useCallback(
    (chatId: string, messageId: string, content: string) => {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: chat.messages.map((msg) =>
                  msg.id === messageId ? { ...msg, content } : msg
                ),
              }
            : chat
        )
      )
    },
    [setChats]
  )

  const addCustomModel = useCallback(
    (url: string) => {
      const trimmedUrl = url.trim()
      if (!trimmedUrl) return null
      const name = trimmedUrl.split('/').pop() || 'Custom Model'
      const model: CustomModel = {
        id: `custom-${createId()}`,
        name,
        url: trimmedUrl,
      }
      setCustomModels((prev) => [...prev, model])
      return model.id
    },
    [setCustomModels]
  )

  return {
    chats,
    currentChatId,
    selectedModelId,
    customModels,
    setSelectedModelId,
    createNewChat,
    selectChat,
    deleteChat,
    addMessage,
    updateMessageContent,
    addCustomModel,
  }
}

export function useChatModelSelection() {
  const [selectedModelId] = useAtom(selectedModelIdAtom)
  const setSelectedModelId = useSetAtom(selectedModelIdAtom)
  return { selectedModelId, setSelectedModelId }
}
