import AsyncStorage from '@react-native-async-storage/async-storage'
import { atom, useAtom } from 'jotai'
import { atomWithStorage, createJSONStorage } from 'jotai/utils'

import { languageAdapters } from '../config/providers'
import { toolDefinitions } from '../tools'

const storage = createJSONStorage<any>(() => AsyncStorage)

export type MessageRole = 'user' | 'assistant'
export type MessageType = 'text' | 'toolExecution'

export type Message = {
  id: string
  role: MessageRole
  content: string
  createdAt: string
  type?: MessageType
  toolExecution?: {
    toolName: string
    payload: unknown
    result?: unknown
  }
}

export type ChatSettings = {
  modelId: string
  temperature: number
  maxSteps: number
  enabledToolIds: string[]
}

/** Single element in the generative UI tree (id is the key in elements). */
export type ChatUIElement = {
  type: string
  props: Record<string, unknown>
  children?: string[]
}

/** Generative UI spec: root id + elements map. Root element id is always "root" (undeletable View with flex: 1). */
export type ChatUISpec = {
  root: string
  elements: Record<string, ChatUIElement>
}

export const GEN_UI_ROOT_ID = 'root'

/** Default root-only spec so tools and view always have a root to work with. */
export const DEFAULT_GEN_UI_SPEC: ChatUISpec = {
  root: GEN_UI_ROOT_ID,
  elements: {
    [GEN_UI_ROOT_ID]: {
      type: 'Container',
      props: { flex: 1 },
      children: [],
    },
  },
}

const cloneGenUISpec = (spec: ChatUISpec): ChatUISpec => ({
  root: spec.root,
  elements: Object.fromEntries(
    Object.entries(spec.elements).map(([id, element]) => [
      id,
      {
        ...element,
        props: { ...(element.props ?? {}) },
        children: [...(element.children ?? [])],
      },
    ])
  ),
})

/** Ensures spec has an undeletable root Container with flex: 1. */
export function normalizeGenUISpec(
  spec: ChatUISpec | null | undefined
): ChatUISpec | null {
  if (!spec) return null
  const elements = { ...spec.elements }
  if (!elements[GEN_UI_ROOT_ID]) {
    elements[GEN_UI_ROOT_ID] = {
      type: 'Container',
      props: { flex: 1 },
      children: [],
    }
  }
  const rootId = spec.root || GEN_UI_ROOT_ID
  if (!elements[rootId]) elements[rootId] = elements[GEN_UI_ROOT_ID]
  return { root: rootId, elements }
}

/** Get normalized UI spec for a chat by id. Returns default root spec when chat has no uiSpec. */
export function getChatUISpecFromChats(
  chats: Chat[],
  chatId: string
): ChatUISpec {
  const chat = chats.find((c) => c.id === chatId)
  const normalized = normalizeGenUISpec(chat?.uiSpec ?? null)
  return normalized
    ? cloneGenUISpec(normalized)
    : cloneGenUISpec(DEFAULT_GEN_UI_SPEC)
}

export type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  settings: ChatSettings
  /** Generative UI spec (root + elements). Root node id "root" is always present. */
  uiSpec?: ChatUISpec | null
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

const pendingSettingsAtom = atom<ChatSettings>({ ...DEFAULT_SETTINGS })

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`

const truncateTitle = (content: string) =>
  content.length > 30 ? `${content.slice(0, 30)}...` : content

export function useChatStore() {
  const [chats, setChats] = useAtom(chatsAtom)
  const [currentChatId, setCurrentChatId] = useAtom(currentChatIdAtom)
  const [pendingSettings, setPendingSettings] = useAtom(pendingSettingsAtom)

  const currentChat = chats.find((chat) => chat.id === currentChatId)

  const getSafeChats = (value: unknown) =>
    Array.isArray(value) ? value : chats

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

    const isNewChat = !currentChatId || !currentChat
    if (isNewChat) {
      const firstUserMessage = messages.find((m) => m.role === 'user')
      setChats((prev) => {
        const arr = getSafeChats(prev)
        return [
          {
            id: chatId,
            title: firstUserMessage
              ? truncateTitle(firstUserMessage.content)
              : 'New Chat',
            messages: newMessages,
            createdAt: new Date().toISOString(),
            settings: { ...pendingSettings },
            uiSpec: undefined,
          },
          ...arr,
        ]
      })
      setCurrentChatId(chatId)
      resetPendingSettings()
    } else {
      setChats((prev) => {
        const arr = getSafeChats(prev)
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

  const addToolExecutionMessage = (
    chatId: string,
    toolName: string,
    payload: unknown,
    result?: unknown
  ) => {
    const toolMessage: Message = {
      id: createId(),
      role: 'assistant',
      type: 'toolExecution',
      content: `Executed tool: ${toolName}`,
      createdAt: new Date().toISOString(),
      toolExecution: {
        toolName,
        payload,
        result,
      },
    }

    setChats((prev) => {
      return (prev as Chat[]).map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [
                ...chat.messages.slice(0, -1),
                toolMessage,
                ...chat.messages.slice(-1),
              ],
            }
          : chat
      )
    })
  }

  const updateChatUISpec = (chatId: string, spec: ChatUISpec | null) => {
    const normalized = normalizeGenUISpec(spec)

    setChats((prev) => {
      return (prev as Chat[]).map((chat) =>
        chat.id === chatId ? { ...chat, uiSpec: normalized ?? undefined } : chat
      )
    })
  }

  const updateMessageContent = (
    chatId: string,
    messageId: string,
    content: string
  ) => {
    setChats((prev) => {
      return (prev as Chat[]).map((chat) =>
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

  const updateChatSettings = (updates: Partial<ChatSettings>) => {
    if (!currentChatId) {
      setPendingSettings((prev) => ({ ...prev, ...updates }))
      return
    }
    setChats((prev) => {
      const arr = getSafeChats(prev)
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

  const hasGenerativeUI = Boolean(currentChat?.uiSpec)

  return {
    chats,
    currentChatId,
    currentChat,
    chatSettings,
    hasGenerativeUI,
    selectChat: setCurrentChatId,
    deleteChat,
    addMessages,
    addToolExecutionMessage,
    updateMessageContent,
    updateChatUISpec,
    updateChatSettings,
    toggleTool,
  }
}
