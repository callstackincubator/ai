import type { LanguageModelV3 } from '@ai-sdk/provider'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { stepCountIs, streamText } from 'ai'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import Reanimated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { createLlamaLanguageSetupAdapter } from '../../../components/adapters/llamaModelSetupAdapter'
import { ModelLifecycleManager } from '../../../components/ModelLifecycleManager'
import type { Availability, SetupAdapter } from '../../../config/providers'
import { languageAdapters } from '../../../config/providers'
import { useChatStore, useDownloadStore } from '../../../store/chatStore'
import { toolDefinitions } from '../../../tools'

// Delete action for swipeable model items
function DeleteAction(
  _prog: SharedValue<number>,
  drag: SharedValue<number>,
  swipeableMethods: SwipeableMethods,
  onDelete: () => void
) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + 72 }],
  }))

  const handleDelete = async () => {
    await onDelete()
    swipeableMethods.close()
  }

  return (
    <Reanimated.View
      style={animatedStyle}
      className="h-full w-[72px] items-center justify-center"
    >
      <Pressable
        onPress={handleDelete}
        className="h-10 w-10 items-center justify-center rounded-full bg-red-500"
      >
        <MaterialIcons name="delete" size={18} color="#fff" />
      </Pressable>
    </Reanimated.View>
  )
}

function ModelItem({
  adapter,
  isSelected,
  onSelect,
}: {
  adapter: SetupAdapter<LanguageModelV3>
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const {
    startDownload,
    updateProgress,
    completeDownload,
    isDownloading,
    getProgress,
  } = useDownloadStore()
  const [availability, setAvailability] = useState<Availability>('no')
  const swipeableRef = useRef<SwipeableMethods>(null)

  const isModelDownloading = isDownloading(adapter.modelId)
  const downloadProgress = getProgress(adapter.modelId) ?? 0
  const isAvailable = availability === 'yes'
  const { accentColor, icon } = adapter.display

  useEffect(() => {
    let mounted = true
    adapter.isAvailable().then((result) => {
      if (mounted) setAvailability(result)
    })
    return () => {
      mounted = false
    }
  }, [adapter])

  const handlePress = async () => {
    if (isModelDownloading) return
    if (availability === 'availableForDownload') {
      startDownload(adapter.modelId)
      try {
        await adapter.download((percentage) => {
          updateProgress(adapter.modelId, percentage)
        })
        const result = await adapter.isAvailable()
        setAvailability(result)
      } catch (error) {
        console.error('Download failed', error)
      } finally {
        completeDownload(adapter.modelId)
      }
      return
    }
    if (availability === 'yes') {
      onSelect(adapter.modelId)
    }
  }

  const handleDelete = useCallback(async () => {
    if (isModelDownloading) return
    try {
      await adapter.delete()
      const result = await adapter.isAvailable()
      setAvailability(result)
    } catch (error) {
      console.error('Delete failed', error)
    }
  }, [adapter, isModelDownloading])

  const renderRightActions = useCallback(
    (
      prog: SharedValue<number>,
      drag: SharedValue<number>,
      swipeableMethods: SwipeableMethods
    ) => DeleteAction(prog, drag, swipeableMethods, handleDelete),
    [handleDelete]
  )

  const content = (
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
        <MaterialIcons
          name={icon as React.ComponentProps<typeof MaterialIcons>['name']}
          size={20}
          color="#fff"
        />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-semibold text-slate-900">
            {adapter.display.label}
          </Text>
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: `${accentColor}20` }}
          >
            <Text
              className="text-[10px] font-semibold"
              style={{ color: accentColor }}
            >
              {adapter.model.provider}
            </Text>
          </View>
        </View>
        {isModelDownloading ? (
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
        {isAvailable && !isModelDownloading ? (
          <Text className="mt-1 text-xs text-slate-500">Downloaded</Text>
        ) : null}
        {!isAvailable && !isModelDownloading ? (
          <Text className="mt-1 text-xs text-slate-500">
            {availability === 'no'
              ? 'Not available on this device'
              : 'Tap to download'}
          </Text>
        ) : null}
      </View>
      <View className="items-center justify-center">
        {isModelDownloading ? (
          <ActivityIndicator size="small" color="#2563EB" />
        ) : isSelected ? (
          <MaterialIcons name="check" size={20} color="#2563EB" />
        ) : null}
      </View>
    </Pressable>
  )

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      enabled={!adapter.builtIn && isAvailable && !isModelDownloading}
      renderRightActions={renderRightActions}
      overshootRight={false}
    >
      {content}
    </ReanimatedSwipeable>
  )
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)

  const navigation = useNavigation()

  const {
    currentChat,
    chatSettings,
    customModels,
    updateChatSettings,
    toggleTool,
    addMessages,
    updateMessageContent,
    addCustomModel,
  } = useChatStore()

  const { modelId: selectedModelId, temperature, enabledToolIds } = chatSettings

  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  const modelSheetRef = useRef<TrueSheet>(null)
  const settingsSheetRef = useRef<TrueSheet>(null)

  const { getProgress } = useDownloadStore()

  const adaptersByProvider = useMemo(() => {
    const customAdapters = customModels.map((model) =>
      createLlamaLanguageSetupAdapter(model.url, toolDefinitions)
    )
    const all = [...languageAdapters, ...customAdapters]
    const grouped = new Map<string, SetupAdapter<LanguageModelV3>[]>()
    for (const adapter of all) {
      const key = adapter.model.provider
      const group = grouped.get(key) ?? []
      group.push(adapter)
      grouped.set(key, group)
    }
    return grouped
  }, [customModels])

  const allAdapters = [...adaptersByProvider.values()].flat()

  // todo: what if this is null (typically corrupted data)
  const selectedAdapter = allAdapters.find(
    (adapter) => adapter.modelId === selectedModelId
  )!

  const selectedModelDownloadProgress = getProgress(selectedModelId)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true })
  }, [currentChat?.messages.length])

  // Filter tool definitions to only enabled ones
  const enabledTools = useMemo(
    () =>
      Object.fromEntries(
        enabledToolIds
          .filter((id) => toolDefinitions[id])
          .map((id) => [id, toolDefinitions[id]])
      ),
    [enabledToolIds]
  )

  // Send message and stream AI response
  const handleSend = async () => {
    if (!input.trim() || isGenerating) return
    const userInput = input.trim()
    setInput('')

    const baseMessages = currentChat?.messages ?? []
    const { chatId, messageIds } = addMessages([
      { role: 'user', content: userInput },
      { role: 'assistant', content: '...' },
    ])
    const assistantMessageId = messageIds[1]
    setIsGenerating(true)

    try {
      const result = streamText({
        model: selectedAdapter.model,
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
        updateMessageContent(chatId, assistantMessageId, accumulated)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate response'
      updateMessageContent(chatId, assistantMessageId, `Error: ${message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // Update chat settings with selected model
  const handleModelSelect = (id: string) => {
    updateChatSettings({ modelId: id })
    modelSheetRef.current?.dismiss()
  }

  // Add custom HuggingFace model and select it
  const handleAddCustomModel = () => {
    const newId = addCustomModel(customUrl)
    if (newId) {
      updateChatSettings({ modelId: newId })
      setCustomUrl('')
      setShowCustomInput(false)
      modelSheetRef.current?.dismiss()
    }
  }

  const inputPaddingBottom = Math.max(8, insets.bottom + 8)

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <ModelLifecycleManager adapter={selectedAdapter} />
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-1 bg-white">
          <View className="flex-row items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3">
            <Pressable
              onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
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
                    : selectedAdapter.display.label}
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
            {(currentChat?.messages.length ?? 0) === 0 ? (
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
                    selectedAdapter.display.label
                  }. Ask questions, get creative, or explore ideas.`}
                </Text>
              </View>
            ) : (
              currentChat?.messages.map((message) => {
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

      <TrueSheet ref={modelSheetRef} scrollable>
        <View className="rounded-t-3xl px-4 pb-8 pt-3">
          <View className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
          <ScrollView nestedScrollEnabled>
            <View className="py-4">
              <Text className="text-lg font-semibold text-slate-900">
                Choose Model
              </Text>
            </View>
            {Array.from(adaptersByProvider.entries()).map(
              ([providerLabel, adapters], index) => (
                <View key={providerLabel}>
                  <Text
                    className={`px-1 text-xs font-semibold uppercase tracking-wider text-slate-400 ${index > 0 ? 'mt-6' : ''}`}
                  >
                    {providerLabel}
                  </Text>
                  <View className="mt-2 gap-2">
                    {adapters.map((adapter) => (
                      <ModelItem
                        key={adapter.modelId}
                        adapter={adapter}
                        isSelected={selectedModelId === adapter.modelId}
                        onSelect={handleModelSelect}
                      />
                    ))}
                  </View>
                </View>
              )
            )}
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
              {Object.entries(toolDefinitions).map(([id, tool]) => {
                const enabled = enabledToolIds.includes(id)
                return (
                  <Pressable
                    key={id}
                    onPress={() => toggleTool(id)}
                    className={`flex-row items-center gap-3 rounded-2xl p-4 ${
                      enabled ? 'bg-blue-50' : 'bg-slate-100'
                    }`}
                  >
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-slate-900">
                        {tool.title}
                      </Text>
                      <Text className="text-xs text-slate-500">
                        {tool.description}
                      </Text>
                    </View>
                    {enabled && (
                      <MaterialIcons name="check" size={20} color="#2563EB" />
                    )}
                  </Pressable>
                )
              })}
            </View>

            <View className="mt-6">
              <Text className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Model Settings
              </Text>
              <View className="mt-3 rounded-2xl bg-slate-100 p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900">
                      Temperature
                    </Text>
                    <Text className="text-xs text-slate-500">
                      Controls randomness (0-2)
                    </Text>
                  </View>
                  <TextInput
                    value={String(temperature)}
                    onChangeText={(text) => {
                      const num = parseFloat(text)
                      if (!isNaN(num) && num >= 0 && num <= 2) {
                        updateChatSettings({ temperature: num })
                      }
                    }}
                    keyboardType="decimal-pad"
                    className="w-20 rounded-xl bg-white px-3 py-2 text-center text-base font-semibold text-blue-600"
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </TrueSheet>
    </SafeAreaView>
  )
}
