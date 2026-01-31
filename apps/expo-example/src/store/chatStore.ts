import { atom, useAtom } from 'jotai'

import { languageAdapters } from '../config/providers'
import { toolDefinitions } from '../tools'

export type MessageRole = 'user' | 'assistant'

export type Message = {
  id: string
  role: MessageRole
  content: string
  createdAt: Date
}

export type ChatSettings = {
  modelId: string
  temperature: number
  enabledToolIds: string[]
}

export type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
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
  enabledToolIds: Object.keys(toolDefinitions),
}

const chatsAtom = atom<Chat[]>([])
const currentChatIdAtom = atom<string | null>(null)
const customModelsAtom = atom<CustomModel[]>([])
const downloadProgressAtom = atom<Record<string, number>>({})
const pendingSettingsAtom = atom<ChatSettings>({ ...DEFAULT_SETTINGS })

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`

const truncateTitle = (content: string) =>
  content.length > 30 ? `${content.slice(0, 30)}...` : content

export function useChatStore() {
  const [chats, setChats] = useAtom(chatsAtom)
  const [currentChatId, setCurrentChatId] = useAtom(currentChatIdAtom)
  const [customModels, setCustomModels] = useAtom(customModelsAtom)
  const [pendingSettings, setPendingSettings] = useAtom(pendingSettingsAtom)

  const currentChat = chats.find((chat) => chat.id === currentChatId)

  const resetPendingSettings = () => {
    setPendingSettings({ ...DEFAULT_SETTINGS })
  }

  const createNewChat = () => {
    const id = createId()
    setChats((prev) => [
      {
        id,
        title: 'New Chat',
        messages: [],
        createdAt: new Date(),
        settings: { ...pendingSettings },
      },
      ...prev,
    ])
    setCurrentChatId(id)
    resetPendingSettings()
    return id
  }

  const deleteChat = (id: string) => {
    setChats((prev) => {
      const next = prev.filter((chat) => chat.id !== id)
      if (currentChatId === id) setCurrentChatId(next[0]?.id ?? null)
      return next
    })
  }

  const addMessages = (messages: Omit<Message, 'id' | 'createdAt'>[]) => {
    const chatId = currentChatId ?? createId()
    const newMessages = messages.map((message) => ({
      ...message,
      id: createId(),
      createdAt: new Date(),
    }))

    const isNewChat = !currentChatId
    if (isNewChat) {
      const firstUserMessage = messages.find((m) => m.role === 'user')
      setChats((prev) => [
        {
          id: chatId,
          title: firstUserMessage
            ? truncateTitle(firstUserMessage.content)
            : 'New Chat',
          messages: newMessages,
          createdAt: new Date(),
          settings: { ...pendingSettings },
        },
        ...prev,
      ])
      setCurrentChatId(chatId)
      resetPendingSettings()
    } else {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, ...newMessages],
              }
            : chat
        )
      )
    }

    return { chatId, messageIds: newMessages.map((m) => m.id) }
  }

  const updateMessageContent = (
    chatId: string,
    messageId: string,
    content: string
  ) => {
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
  }

  const addCustomModel = (url: string) => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return null
    const id = `custom-${createId()}`
    setCustomModels((prev) => [
      ...prev,
      {
        id,
        name: trimmedUrl.split('/').pop() || 'Custom Model',
        url: trimmedUrl,
      },
    ])
    return id
  }

  const updateChatSettings = (updates: Partial<ChatSettings>) => {
    if (!currentChatId) {
      setPendingSettings((prev) => ({ ...prev, ...updates }))
      return
    }
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === currentChatId
          ? { ...chat, settings: { ...chat.settings, ...updates } }
          : chat
      )
    )
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
    createNewChat,
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
