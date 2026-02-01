import AsyncStorage from '@react-native-async-storage/async-storage'
import { atom, useAtom } from 'jotai'
import { atomWithStorage, createJSONStorage } from 'jotai/utils'

import { languageAdapters } from '../config/providers'
import { toolDefinitions } from '../tools'

const storage = createJSONStorage<any>(() => AsyncStorage)

export type MessageRole = 'user' | 'assistant'

export type Message = {
  id: string
  role: MessageRole
  content: string
  createdAt: string
}

export type ChatSettings = {
  modelId: string
  temperature: number
  maxSteps: number
  enabledToolIds: string[]
}

export type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  settings: ChatSettings
}

export type CustomModel = {
  id: string
  name: string
  url: string
}

const DEFAULT_SETTINGS: ChatSettings = {
  modelId: languageAdapters[0].modelId,
  temperature: 0.7,
  maxSteps: 5,
  enabledToolIds: Object.keys(toolDefinitions),
}

const chatsAtom = atomWithStorage<Chat[]>('chats', [], storage)
const currentChatIdAtom = atomWithStorage<string | null>(
  'currentChatId',
  null,
  storage
)
const customModelsAtom = atomWithStorage<CustomModel[]>(
  'customModels',
  [],
  storage
)
const downloadProgressAtom = atom<Record<string, number>>({})
const pendingSettingsAtom = atom<ChatSettings>({ ...DEFAULT_SETTINGS })

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`

const truncateTitle = (content: string) =>
  content.length > 30 ? `${content.slice(0, 30)}...` : content

export function useChatStore() {
  const [chatsRaw, setChats] = useAtom(chatsAtom)
  const [currentChatId, setCurrentChatId] = useAtom(currentChatIdAtom)
  const [customModelsRaw, setCustomModels] = useAtom(customModelsAtom)
  const [pendingSettings, setPendingSettings] = useAtom(pendingSettingsAtom)

  // Ensure arrays are resolved (atomWithStorage returns arrays directly after hydration)
  const chats = Array.isArray(chatsRaw) ? chatsRaw : []
  const customModels = Array.isArray(customModelsRaw) ? customModelsRaw : []

  const currentChat = chats.find((chat) => chat.id === currentChatId)

  const resetPendingSettings = () => {
    setPendingSettings({ ...DEFAULT_SETTINGS })
  }

  const deleteChat = (id: string) => {
    const shouldUpdateCurrentChat = currentChatId === id
    const remainingChats = chats.filter((chat) => chat.id !== id)

    setChats(remainingChats)

    if (shouldUpdateCurrentChat) {
      setCurrentChatId(remainingChats[0]?.id ?? null)
    }
  }

  const addMessages = (messages: Omit<Message, 'id' | 'createdAt'>[]) => {
    const chatId = currentChatId ?? createId()
    const newMessages = messages.map((message) => ({
      ...message,
      id: createId(),
      createdAt: new Date().toISOString(),
    }))

    const isNewChat = !currentChatId
    if (isNewChat) {
      const firstUserMessage = messages.find((m) => m.role === 'user')
      setChats((prev) => {
        const arr = Array.isArray(prev) ? prev : []
        return [
          {
            id: chatId,
            title: firstUserMessage
              ? truncateTitle(firstUserMessage.content)
              : 'New Chat',
            messages: newMessages,
            createdAt: new Date().toISOString(),
            settings: { ...pendingSettings },
          },
          ...arr,
        ]
      })
      setCurrentChatId(chatId)
      resetPendingSettings()
    } else {
      setChats((prev) => {
        const arr = Array.isArray(prev) ? prev : []
        return arr.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, ...newMessages],
              }
            : chat
        )
      })
    }

    return { chatId, messageIds: newMessages.map((m) => m.id) }
  }

  const updateMessageContent = (
    chatId: string,
    messageId: string,
    content: string
  ) => {
    setChats((prev) => {
      const arr = Array.isArray(prev) ? prev : []
      return arr.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: chat.messages.map((msg) =>
                msg.id === messageId ? { ...msg, content } : msg
              ),
            }
          : chat
      )
    })
  }

  const addCustomModel = (url: string) => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl || !trimmedUrl.endsWith('.gguf')) return null
    const id = `custom-${createId()}`
    setCustomModels((prev) => {
      const arr = Array.isArray(prev) ? prev : []
      return [
        ...arr,
        {
          id,
          name: trimmedUrl.split('/').pop() || 'Custom Model',
          url: trimmedUrl,
        },
      ]
    })
    return id
  }

  const updateChatSettings = (updates: Partial<ChatSettings>) => {
    if (!currentChatId) {
      setPendingSettings((prev) => ({ ...prev, ...updates }))
      return
    }
    setChats((prev) => {
      const arr = Array.isArray(prev) ? prev : []
      return arr.map((chat) =>
        chat.id === currentChatId
          ? { ...chat, settings: { ...chat.settings, ...updates } }
          : chat
      )
    })
  }

  const chatSettings = currentChat?.settings ?? pendingSettings

  const toggleTool = (toolId: string) => {
    const tools = chatSettings.enabledToolIds
    updateChatSettings({
      enabledToolIds: tools.includes(toolId)
        ? tools.filter((id) => id !== toolId)
        : [...tools, toolId],
    })
  }

  return {
    chats,
    currentChatId,
    currentChat,
    chatSettings,
    customModels,
    selectChat: setCurrentChatId,
    deleteChat,
    addMessages,
    updateMessageContent,
    addCustomModel,
    updateChatSettings,
    toggleTool,
  }
}

export function useDownloadStore() {
  const [downloadProgress, setDownloadProgress] = useAtom(downloadProgressAtom)

  return {
    downloadProgress,
    startDownload: (modelId: string) =>
      setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 })),
    updateProgress: (modelId: string, progress: number) =>
      setDownloadProgress((prev) => ({ ...prev, [modelId]: progress })),
    completeDownload: (modelId: string) =>
      setDownloadProgress((prev) => {
        const next = { ...prev }
        delete next[modelId]
        return next
      }),
    isDownloading: (modelId: string) => downloadProgress[modelId] !== undefined,
    getProgress: (modelId: string) => downloadProgress[modelId],
  }
}
