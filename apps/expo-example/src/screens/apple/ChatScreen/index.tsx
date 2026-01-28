import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { Tool as ToolDefinition } from '@ai-sdk/provider-utils'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { stepCountIs, streamText } from 'ai'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { createLlamaLanguageSetupAdapter } from '../../../components/adapters/llamaModelSetupAdapter'
import type { Availability, SetupAdapter } from '../../../config/providers'
import { languageAdapters, toolDefinitions } from '../../../config/providers'
import { useChatStore } from '../../../store/chatStore'

type ToolSet = Record<string, ToolDefinition>

type ModelOption = {
  id: string
  name: string
  provider: 'apple' | 'llama' | 'custom'
  adapter: SetupAdapter<LanguageModelV3>
}

type ToolState = {
  id: string
  name: string
  description: string
  icon: 'globe' | 'code' | 'image'
  enabled: boolean
}

const defaultTools: ToolState[] = [
  {
    id: 'webSearch',
    name: 'Web Search',
    description: 'Search the web for current information',
    icon: 'globe',
    enabled: false,
  },
  {
    id: 'codeInterpreter',
    name: 'Code Interpreter',
    description: 'Run code and analyze data',
    icon: 'code',
    enabled: false,
  },
  {
    id: 'imageGeneration',
    name: 'Image Generation',
    description: 'Create images from descriptions',
    icon: 'image',
    enabled: false,
  },
]

function formatChatDate(date: Date) {
  const now = new Date()
  const diffInDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (diffInDays === 0) return 'Today'
  if (diffInDays === 1) return 'Yesterday'
  if (diffInDays < 7) return `${diffInDays} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ToolIcon({ icon }: { icon: ToolState['icon'] }) {
  if (icon === 'code') {
    return <MaterialIcons name="code" size={20} color="#2563EB" />
  }
  if (icon === 'image') {
    return <MaterialIcons name="image" size={20} color="#2563EB" />
  }
  return <MaterialIcons name="public" size={20} color="#2563EB" />
}

function ModelItem({
  model,
  isSelected,
  onSelect,
  onDownloadStart,
  onDownloadProgress,
  onDownloadComplete,
}: {
  model: ModelOption
  isSelected: boolean
  onSelect: (id: string) => void
  onDownloadStart: (id: string) => void
  onDownloadProgress: (id: string, progress: number) => void
  onDownloadComplete: (id: string) => void
}) {
  const [availability, setAvailability] = useState<Availability>('no')
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const translateX = useRef(new Animated.Value(0)).current
  const [isSwipedOpen, setIsSwipedOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    model.adapter.isAvailable().then((result) => {
      if (mounted) setAvailability(result)
    })
    return () => {
      mounted = false
    }
  }, [model.adapter])

  const handlePress = async () => {
    if (isDownloading) {
      return
    }
    if (availability === 'availableForDownload') {
      setIsDownloading(true)
      setDownloadProgress(0)
      onDownloadStart(model.id)
      try {
        await model.adapter.download((percentage) => {
          setDownloadProgress(percentage)
          onDownloadProgress(model.id, percentage)
        })
        const result = await model.adapter.isAvailable()
        setAvailability(result)
      } catch (error) {
        console.error('Download failed', error)
      } finally {
        setIsDownloading(false)
        onDownloadComplete(model.id)
      }
      return
    }

    if (availability === 'yes') {
      onSelect(model.id)
    }
  }

  const handleDelete = async () => {
    if (isDownloading) {
      return
    }
    try {
      await model.adapter.delete()
      const result = await model.adapter.isAvailable()
      setAvailability(result)
    } catch (error) {
      console.error('Delete failed', error)
    } finally {
      onDownloadComplete(model.id)
      Animated.timing(translateX, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => setIsSwipedOpen(false))
    }
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 10,
        onPanResponderMove: (_, gesture) => {
          if (gesture.dx < 0) {
            translateX.setValue(Math.max(gesture.dx, -72))
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -40) {
            Animated.timing(translateX, {
              toValue: -72,
              duration: 180,
              useNativeDriver: true,
            }).start(() => setIsSwipedOpen(true))
          } else {
            Animated.timing(translateX, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }).start(() => setIsSwipedOpen(false))
          }
        },
      }),
    [translateX]
  )

  const isAvailable = availability === 'yes'

  const accentColor =
    model.provider === 'llama' || model.provider === 'custom'
      ? '#F97316'
      : '#2563EB'
  const iconName =
    model.provider === 'llama' || model.provider === 'custom'
      ? 'memory'
      : 'auto-awesome'

  return (
    <View className="w-full">
      {(model.provider === 'llama' || model.provider === 'custom') && (
        <View className="absolute right-0 top-0 h-full w-[72px] items-center justify-center">
          <Pressable
            onPress={handleDelete}
            className="h-10 w-10 items-center justify-center rounded-full bg-red-500"
            disabled={isDownloading}
          >
            <MaterialIcons name="delete" size={18} color="#fff" />
          </Pressable>
        </View>
      )}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...((model.provider === 'llama' || model.provider === 'custom') &&
        isAvailable &&
        !isDownloading
          ? panResponder.panHandlers
          : {})}
      >
        <Pressable
          onPress={handlePress}
          className={`w-full flex-row items-center gap-3 rounded-2xl p-3 ${
            isSelected ? 'bg-blue-50' : 'bg-white'
          }`}
        >
          <View
            className="h-10 w-10 items-center justify-center rounded-2xl"
            style={{ backgroundColor: accentColor }}
          >
            <MaterialIcons name={iconName} size={20} color="#fff" />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-semibold text-slate-900">
                {model.name}
              </Text>
              {model.provider === 'apple' ? (
                <View className="rounded-full bg-blue-100 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-blue-600">
                    Built-in
                  </Text>
                </View>
              ) : model.provider === 'llama' || model.provider === 'custom' ? (
                <View className="rounded-full bg-orange-100 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-orange-600">
                    Llama
                  </Text>
                </View>
              ) : null}
            </View>
            {isDownloading ? (
              <View className="mt-2">
                <View className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <View
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </View>
                <Text className="mt-1 text-xs text-slate-500">
                  Downloading... {downloadProgress}%
                </Text>
              </View>
            ) : null}
            {isAvailable && !isDownloading ? (
              <Text className="mt-1 text-xs text-slate-500">Downloaded</Text>
            ) : null}
            {!isAvailable && !isDownloading ? (
              <Text className="mt-1 text-xs text-slate-500">
                {availability === 'no'
                  ? 'Not available on this device'
                  : 'Tap to download'}
              </Text>
            ) : null}
          </View>
          <View className="items-center justify-center">
            {isDownloading ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : isSelected ? (
              <MaterialIcons name="check" size={20} color="#2563EB" />
            ) : isSwipedOpen ? (
              <MaterialIcons name="chevron-left" size={20} color="#CBD5F5" />
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  )
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)
  const previousAdapter = useRef<SetupAdapter<LanguageModelV3> | null>(null)

  const {
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
  } = useChatStore()

  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [temperature, setTemperature] = useState(0.7)
  const [tools, setTools] = useState<ToolState[]>(defaultTools)
  const [downloadProgressById, setDownloadProgressById] = useState<
    Record<string, number>
  >({})
  const [modelSheetContentHeight, setModelSheetContentHeight] = useState(0)
  const [settingsSheetContentHeight, setSettingsSheetContentHeight] =
    useState(0)
  const modelSheetRef = useRef<TrueSheet>(null)
  const settingsSheetRef = useRef<TrueSheet>(null)

  const currentChat = chats.find((chat) => chat.id === currentChatId)

  const builtInModels = useMemo<ModelOption[]>(() => {
    return [
      {
        id: 'builtin-0',
        name: 'Apple Intelligence',
        provider: 'apple',
        adapter: languageAdapters[0],
      },
      {
        id: 'builtin-1',
        name: 'SmolLM3 3B',
        provider: 'llama',
        adapter: languageAdapters[1],
      },
      {
        id: 'builtin-2',
        name: 'Qwen 2.5 3B',
        provider: 'llama',
        adapter: languageAdapters[2],
      },
    ]
  }, [])

  const customAdapters = useMemo<ModelOption[]>(() => {
    return customModels.map((model) => ({
      id: model.id,
      name: model.name,
      provider: 'custom',
      adapter: createLlamaLanguageSetupAdapter(model.url, toolDefinitions),
    }))
  }, [customModels])

  const onDeviceModels = useMemo(
    () => builtInModels.filter((model) => model.provider === 'apple'),
    [builtInModels]
  )
  const llamaModels = useMemo(
    () => [
      ...builtInModels.filter((model) => model.provider === 'llama'),
      ...customAdapters,
    ],
    [builtInModels, customAdapters]
  )

  const modelOptions = useMemo(
    () => [...onDeviceModels, ...llamaModels],
    [llamaModels, onDeviceModels]
  )

  const selectedModel = modelOptions.find(
    (model) => model.id === selectedModelId
  )
  const selectedModelDownloadProgress = downloadProgressById[selectedModelId]

  useEffect(() => {
    if (!selectedModel) return
    const nextAdapter = selectedModel.adapter
    if (previousAdapter.current && previousAdapter.current !== nextAdapter) {
      void previousAdapter.current.unload()
    }
    previousAdapter.current = nextAdapter
    void nextAdapter.prepare()
  }, [selectedModel])

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true })
  }, [currentChat?.messages?.length])

  const enabledTools = useMemo(() => {
    const active: ToolSet = {}
    tools.forEach((tool) => {
      if (tool.enabled) {
        const definition = toolDefinitions[tool.id]
        if (definition) {
          active[tool.id] = definition
        }
      }
    })
    return active
  }, [tools])

  const handleSend = async () => {
    if (!input.trim() || isGenerating || !selectedModel) return
    const userInput = input.trim()
    setInput('')

    const baseMessages = currentChat?.messages ?? []
    const { chatId } = addMessage({ role: 'user', content: userInput })
    const { messageId } = addMessage({ role: 'assistant', content: '...' })
    setIsGenerating(true)

    try {
      const result = streamText({
        model: selectedModel.adapter.model,
        messages: [
          ...baseMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          { role: 'user', content: userInput },
        ],
        tools: enabledTools,
        temperature,
        stopWhen: stepCountIs(5),
      })

      let accumulated = ''
      for await (const chunk of result.textStream) {
        accumulated += chunk
        updateMessageContent(chatId, messageId, accumulated)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate response'
      updateMessageContent(chatId, messageId, `Error: ${message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleModelSelect = (id: string) => {
    setSelectedModelId(id)
    modelSheetRef.current?.dismiss()
  }

  const handleDownloadStart = (id: string) => {
    setDownloadProgressById((prev) => ({ ...prev, [id]: 0 }))
  }

  const handleDownloadProgress = (id: string, progress: number) => {
    setDownloadProgressById((prev) => ({ ...prev, [id]: progress }))
  }

  const handleDownloadComplete = (id: string) => {
    setDownloadProgressById((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const handleAddCustomModel = () => {
    const newId = addCustomModel(customUrl)
    if (newId) {
      setSelectedModelId(newId)
      setCustomUrl('')
      setShowCustomInput(false)
      modelSheetRef.current?.dismiss()
    }
  }

  const groupedChats = useMemo(() => {
    return chats.reduce(
      (groups, chat) => {
        const key = formatChatDate(chat.createdAt)
        if (!groups[key]) groups[key] = []
        groups[key].push(chat)
        return groups
      },
      {} as Record<string, typeof chats>
    )
  }, [chats])

  const inputPaddingBottom = Math.max(8, insets.bottom + 8)

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-1 bg-white">
          <View className="flex-row items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3">
            <Pressable
              onPress={() => setIsMenuOpen(true)}
              className="h-9 w-9 items-center justify-center rounded-full bg-slate-100"
            >
              <MaterialIcons name="menu" size={20} color="#475569" />
            </Pressable>
            <Pressable
              onPress={() => modelSheetRef.current?.present()}
              className="items-center"
            >
              <Text className="text-base font-semibold text-slate-900">
                {currentChat?.title ?? 'New Chat'}
              </Text>
              <View className="flex-row items-center">
                <Text className="text-xs text-slate-500">
                  {selectedModelDownloadProgress !== undefined
                    ? `Downloading... ${selectedModelDownloadProgress}%`
                    : (selectedModel?.name ?? 'Apple Intelligence')}
                </Text>
                <MaterialIcons
                  name="arrow-drop-down"
                  size={16}
                  color="#64748B"
                />
              </View>
            </Pressable>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => settingsSheetRef.current?.present()}
                className="h-9 w-9 items-center justify-center rounded-full bg-slate-100"
              >
                <MaterialIcons name="tune" size={20} color="#475569" />
              </Pressable>
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            className="flex-1 px-4 py-4"
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: 32,
            }}
          >
            {!currentChat || currentChat.messages.length === 0 ? (
              <View className="flex-1 items-center justify-center py-16">
                <View className="h-20 w-20 items-center justify-center rounded-full bg-blue-100">
                  <MaterialIcons
                    name="auto-awesome"
                    size={32}
                    color="#2563EB"
                  />
                </View>
                <Text className="mt-6 text-xl font-semibold text-slate-900">
                  What can I help you with?
                </Text>
                <Text className="mt-2 max-w-[280px] text-center text-sm text-slate-500">
                  {`Start a conversation with ${
                    selectedModel?.name ?? 'Apple Intelligence'
                  }. Ask questions, get creative, or explore ideas.`}
                </Text>
              </View>
            ) : (
              currentChat.messages.map((message) => {
                const isUser = message.role === 'user'
                return (
                  <View
                    key={message.id}
                    className={`mb-3 flex-row ${
                      isUser ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {!isUser ? (
                      <View className="mr-2 h-8 w-8 items-center justify-center rounded-full bg-blue-600">
                        <MaterialIcons
                          name="auto-awesome"
                          size={16}
                          color="#fff"
                        />
                      </View>
                    ) : null}
                    <View
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                        isUser ? 'bg-blue-600' : 'bg-slate-100'
                      }`}
                    >
                      <Text
                        className={`text-[15px] leading-relaxed ${
                          isUser ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {message.content}
                      </Text>
                    </View>
                  </View>
                )
              })
            )}
          </ScrollView>

          <View
            className="border-t border-slate-200 bg-white/90 px-4 pb-6 pt-3"
            style={{ paddingBottom: inputPaddingBottom }}
          >
            {isRecording ? (
              <View className="mb-3 flex-row items-center justify-center gap-2 rounded-full bg-red-50 px-4 py-2">
                <View className="h-2 w-2 rounded-full bg-red-500" />
                <Text className="text-sm font-semibold text-red-500">
                  Recording...
                </Text>
                <Pressable onPress={() => setIsRecording(false)}>
                  <MaterialIcons name="close" size={16} color="#EF4444" />
                </Pressable>
              </View>
            ) : null}

            {attachmentMenuOpen ? (
              <View className="mb-3 flex-row gap-3">
                <Pressable className="flex-1 flex-row items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3">
                  <MaterialIcons
                    name="photo-camera"
                    size={20}
                    color="#2563EB"
                  />
                  <Text className="text-sm font-semibold text-slate-700">
                    Take Photo
                  </Text>
                </Pressable>
                <Pressable className="flex-1 flex-row items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3">
                  <MaterialIcons
                    name="photo-library"
                    size={20}
                    color="#2563EB"
                  />
                  <Text className="text-sm font-semibold text-slate-700">
                    Photo Library
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => setAttachmentMenuOpen((prev) => !prev)}
                className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
              >
                <MaterialIcons name="add" size={22} color="#64748B" />
              </Pressable>
              <View className="flex-1 rounded-3xl bg-slate-100 px-4 py-1.5">
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  onSubmitEditing={handleSend}
                  placeholder="Message"
                  placeholderTextColor="#94A3B8"
                  returnKeyType="send"
                  multiline={false}
                  blurOnSubmit={false}
                  className="text-[15px] text-slate-900"
                  style={{ minHeight: 34 }}
                  editable={!isGenerating}
                />
              </View>
              <Pressable
                onPress={input.trim() ? handleSend : () => setIsRecording(true)}
                className={`h-10 w-10 items-center justify-center rounded-full ${
                  input.trim() ? 'bg-blue-600' : 'bg-slate-100'
                }`}
                disabled={isGenerating}
              >
                <MaterialIcons
                  name={
                    input.trim() ? 'north' : isRecording ? 'mic-off' : 'mic'
                  }
                  size={20}
                  color={input.trim() ? '#fff' : '#64748B'}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal transparent visible={isMenuOpen} animationType="slide">
        <Pressable
          onPress={() => setIsMenuOpen(false)}
          className="flex-1 bg-black/40"
        >
          <Pressable className="h-full w-[280px] bg-white">
            <View className="border-b border-slate-200 px-4 py-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-semibold text-slate-900">
                  Chats
                </Text>
                <Pressable
                  onPress={createNewChat}
                  className="h-8 w-8 items-center justify-center rounded-full bg-slate-100"
                >
                  <MaterialIcons name="edit" size={18} color="#475569" />
                </Pressable>
              </View>
            </View>
            <ScrollView className="flex-1">
              {chats.length === 0 ? (
                <View className="items-center justify-center px-6 py-10">
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    <MaterialIcons
                      name="chat-bubble-outline"
                      size={22}
                      color="#64748B"
                    />
                  </View>
                  <Text className="mt-3 text-sm text-slate-500">
                    No conversations yet
                  </Text>
                  <Pressable
                    onPress={createNewChat}
                    className="mt-4 rounded-full border border-slate-200 px-4 py-2"
                  >
                    <Text className="text-sm font-semibold text-slate-700">
                      Start a new chat
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View className="py-3">
                  {Object.entries(groupedChats).map(([key, group]) => (
                    <View key={key} className="mb-2">
                      <Text className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {key}
                      </Text>
                      {group.map((chat) => (
                        <Pressable
                          key={chat.id}
                          onPress={() => {
                            selectChat(chat.id)
                            setIsMenuOpen(false)
                          }}
                          className={`mx-3 flex-row items-center gap-3 rounded-2xl px-3 py-3 ${
                            currentChatId === chat.id
                              ? 'bg-slate-100'
                              : 'bg-white'
                          }`}
                        >
                          <MaterialIcons
                            name="chat-bubble-outline"
                            size={18}
                            color="#94A3B8"
                          />
                          <Text className="flex-1 text-sm text-slate-700">
                            {chat.title}
                          </Text>
                          <Pressable onPress={() => deleteChat(chat.id)}>
                            <MaterialIcons
                              name="delete"
                              size={18}
                              color="#EF4444"
                            />
                          </Pressable>
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <TrueSheet ref={modelSheetRef} scrollable>
        <View className="rounded-t-3xl px-4 pb-8 pt-3">
          <View className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
          <ScrollView nestedScrollEnabled>
            <View className="py-4">
              <Text className="text-lg font-semibold text-slate-900">
                Choose Model
              </Text>
            </View>
            <Text className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              On-Device
            </Text>
            <View className="mt-2 gap-2">
              {onDeviceModels.map((model) => (
                <ModelItem
                  key={model.id}
                  model={model}
                  isSelected={selectedModelId === model.id}
                  onSelect={handleModelSelect}
                  onDownloadStart={handleDownloadStart}
                  onDownloadProgress={handleDownloadProgress}
                  onDownloadComplete={handleDownloadComplete}
                />
              ))}
            </View>
            <Text className="mt-6 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Llama
            </Text>
            <View className="mt-2 gap-2">
              {llamaModels.map((model) => (
                <ModelItem
                  key={model.id}
                  model={model}
                  isSelected={selectedModelId === model.id}
                  onSelect={handleModelSelect}
                  onDownloadStart={handleDownloadStart}
                  onDownloadProgress={handleDownloadProgress}
                  onDownloadComplete={handleDownloadComplete}
                />
              ))}
            </View>
            <View className="mt-6">
              {showCustomInput ? (
                <View className="rounded-2xl bg-slate-100 p-4">
                  <Text className="text-sm font-semibold text-slate-700">
                    Add from Hugging Face
                  </Text>
                  <TextInput
                    value={customUrl}
                    onChangeText={setCustomUrl}
                    placeholder="Enter Hugging Face model URL"
                    placeholderTextColor="#94A3B8"
                    className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700"
                  />
                  <View className="mt-3 flex-row gap-2">
                    <Pressable
                      onPress={() => setShowCustomInput(false)}
                      className="flex-1 rounded-full border border-slate-200 px-4 py-2"
                    >
                      <Text className="text-center text-sm font-semibold text-slate-700">
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleAddCustomModel}
                      disabled={!customUrl.trim()}
                      className={`flex-1 rounded-full px-4 py-2 ${
                        customUrl.trim() ? 'bg-blue-600' : 'bg-slate-200'
                      }`}
                    >
                      <Text className="text-center text-sm font-semibold text-white">
                        Add Model
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowCustomInput(true)}
                  className="flex-row items-center gap-3 rounded-2xl border border-slate-200 px-4 py-4"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                    <MaterialIcons name="link" size={20} color="#64748B" />
                  </View>
                  <Text className="text-sm font-semibold text-slate-700">
                    Add Custom Model from Hugging Face
                  </Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </TrueSheet>

      <TrueSheet ref={settingsSheetRef} scrollable>
        <View className="rounded-t-3xl px-4 pb-8 pt-3">
          <View className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
          <ScrollView nestedScrollEnabled>
            <View className="py-4">
              <Text className="text-lg font-semibold text-slate-900">
                Tools & Settings
              </Text>
            </View>
            <Text className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Tools
            </Text>
            <View className="mt-3 gap-3">
              {tools.map((tool) => (
                <Pressable
                  key={tool.id}
                  onPress={() =>
                    setTools((prev) =>
                      prev.map((item) =>
                        item.id === tool.id
                          ? { ...item, enabled: !item.enabled }
                          : item
                      )
                    )
                  }
                  className={`flex-row items-center gap-3 rounded-2xl p-4 ${
                    tool.enabled ? 'bg-blue-50' : 'bg-slate-100'
                  }`}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white">
                    <ToolIcon icon={tool.icon} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900">
                      {tool.name}
                    </Text>
                    <Text className="text-xs text-slate-500">
                      {tool.description}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <View className="mt-6">
              <Text className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Model Settings
              </Text>
              <View className="mt-3 rounded-2xl bg-slate-100 p-4">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-sm font-semibold text-slate-900">
                      Temperature
                    </Text>
                    <Text className="text-xs text-slate-500">
                      Controls randomness in responses
                    </Text>
                  </View>
                  <Text className="text-lg font-semibold text-blue-600">
                    {temperature.toFixed(1)}
                  </Text>
                </View>
                <View className="mt-4 flex-row items-center gap-2">
                  {[0, 1, 2].map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => setTemperature(value === 2 ? 1.2 : value)}
                      className={`flex-1 rounded-full px-3 py-2 ${
                        temperature >= value ? 'bg-blue-600' : 'bg-white'
                      }`}
                    >
                      <Text
                        className={`text-center text-xs font-semibold ${
                          temperature >= value ? 'text-white' : 'text-slate-600'
                        }`}
                      >
                        {value === 0
                          ? 'Precise'
                          : value === 1
                            ? 'Balanced'
                            : 'Creative'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <Text className="text-xs text-slate-500">
                <Text className="font-semibold text-slate-900">Tip:</Text>{' '}
                {`Lower temperature values produce more focused and deterministic responses, while higher values increase creativity and variability.`}
              </Text>
            </View>
          </ScrollView>
        </View>
      </TrueSheet>
    </SafeAreaView>
  )
}
