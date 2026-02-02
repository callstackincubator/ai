import type { LanguageModelV3 } from '@ai-sdk/provider'
import { Button, ContextMenu, Host, Slider } from '@expo/ui/swift-ui'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { DrawerActions, useNavigation } from '@react-navigation/native'
import { stepCountIs, streamText } from 'ai'
import { SymbolView } from 'expo-symbols'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import { useKeyboardHandler } from 'react-native-keyboard-controller'
import Reanimated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { createLlamaLanguageSetupAdapter } from '../../../components/adapters/llamaModelSetupAdapter'
import { AdaptiveGlass } from '../../../components/AdaptiveGlass'
import { RecordButton } from '../../../components/RecordButton'
import type { Availability, SetupAdapter } from '../../../config/providers'
import { languageAdapters } from '../../../config/providers'
import { useChatStore, useDownloadStore } from '../../../store/chatStore'
import { colors } from '../../../theme/colors'
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
    <Reanimated.View style={[animatedStyle, styles.deleteActionContainer]}>
      <Pressable onPress={handleDelete} style={styles.deleteButton}>
        <SymbolView
          name="trash"
          size={18}
          tintColor="#fff"
          resizeMode="scaleAspectFit"
        />
      </Pressable>
    </Reanimated.View>
  )
}

function ModelItem({
  adapter,
  isSelected,
  onSelect,
  isFirst,
  isLast,
}: {
  adapter: SetupAdapter<LanguageModelV3>
  isSelected: boolean
  onSelect: (id: string) => void
  isFirst: boolean
  isLast: boolean
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
  const isUnavailable = availability === 'no'
  const { accentColor } = adapter.display

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

  const handleDelete = async () => {
    if (isModelDownloading) return
    try {
      await adapter.delete()
      const result = await adapter.isAvailable()
      setAvailability(result)
    } catch (error) {
      console.error('Delete failed', error)
    }
  }

  const renderRightActions = (
    prog: SharedValue<number>,
    drag: SharedValue<number>,
    swipeableMethods: SwipeableMethods
  ) => DeleteAction(prog, drag, swipeableMethods, handleDelete)

  const content = (
    <Pressable
      onPress={handlePress}
      disabled={isUnavailable}
      style={[
        styles.modelItemContent,
        isFirst && styles.modelItemFirst,
        isLast && styles.modelItemLast,
      ]}
    >
      <View
        style={[
          styles.modelIcon,
          {
            backgroundColor: isUnavailable ? colors.tertiaryLabel : accentColor,
          },
        ]}
      >
        <SymbolView
          name="cpu"
          size={20}
          tintColor="#fff"
          resizeMode="scaleAspectFit"
        />
      </View>
      <View
        style={[styles.modelItemInfo, !isLast && styles.modelItemInfoBorder]}
      >
        <View style={styles.modelItemTextContainer}>
          <Text
            style={[
              styles.modelItemLabel,
              isUnavailable && styles.modelItemLabelUnavailable,
            ]}
          >
            {adapter.display.label}
          </Text>
          {isModelDownloading ? (
            <View style={styles.downloadProgressContainer}>
              <View style={styles.downloadProgressTrack}>
                <View
                  style={[
                    styles.downloadProgressFill,
                    { width: `${downloadProgress}%` },
                  ]}
                />
              </View>
              <Text style={styles.downloadProgressText}>
                Downloading... {downloadProgress}%
              </Text>
            </View>
          ) : null}
          {isAvailable && !isModelDownloading ? (
            <Text style={styles.modelStatusText}>Downloaded</Text>
          ) : null}
          {!isAvailable && !isModelDownloading ? (
            <Text style={styles.modelStatusText}>
              {availability === 'no'
                ? 'Not available on this device'
                : 'Tap to download'}
            </Text>
          ) : null}
        </View>
        <View style={styles.modelItemTrailing}>
          {isModelDownloading ? (
            <ActivityIndicator size="small" color={colors.systemBlue as any} />
          ) : isSelected ? (
            <SymbolView
              name="checkmark"
              size={20}
              tintColor={colors.systemBlue}
              resizeMode="scaleAspectFit"
            />
          ) : null}
        </View>
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

  const {
    modelId: selectedModelId,
    temperature,
    maxSteps,
    enabledToolIds,
  } = chatSettings

  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  const modelSheetRef = useRef<TrueSheet>(null)
  const settingsSheetRef = useRef<TrueSheet>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const { getProgress } = useDownloadStore()

  // Animated keyboard height for smooth animations
  const keyboardHeight = useSharedValue(insets.bottom)

  const scrollToBottom = () => {
    scrollRef.current?.scrollToEnd({ animated: true })
  }

  useKeyboardHandler(
    {
      onMove: (event) => {
        'worklet'
        keyboardHeight.value = Math.max(event.height, insets.bottom)
      },
      onEnd: () => {
        'worklet'
        scheduleOnRN(scrollToBottom)
      },
    },
    [insets.bottom, scrollToBottom]
  )

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true })
  }, [currentChat?.messages.length])

  const inputBarBottomPadding = useAnimatedStyle(() => ({
    paddingBottom: keyboardHeight.value,
  }))

  const customAdapters = customModels.map((model) =>
    createLlamaLanguageSetupAdapter(model.url, toolDefinitions)
  )

  const adapters = [...languageAdapters, ...customAdapters]

  const adaptersByProvider = new Map<string, SetupAdapter<LanguageModelV3>[]>()
  for (const adapter of adapters) {
    const key = adapter.model.provider
    const group = adaptersByProvider.get(key) ?? []
    group.push(adapter)
    adaptersByProvider.set(key, group)
  }

  const selectedAdapter = adapters.find(
    (adapter) => adapter.modelId === selectedModelId
  )

  const selectedModelDownloadProgress = getProgress(selectedModelId)

  // Filter tool definitions to only enabled ones
  const enabledTools = Object.fromEntries(
    enabledToolIds
      .filter((id) => toolDefinitions[id])
      .map((id) => [id, toolDefinitions[id]])
  )

  // Cleanup streaming on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  // Send message and stream AI response
  const handleSend = async () => {
    if (!input.trim() || isGenerating || !selectedAdapter) return

    // Cancel any previous generation
    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()
    const { signal } = abortControllerRef.current

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
        model: selectedAdapter!.model,
        messages: [
          ...baseMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          { role: 'user', content: userInput },
        ],
        tools: enabledTools,
        temperature,
        stopWhen: stepCountIs(maxSteps),
        abortSignal: signal,
      })

      let accumulated = ''
      for await (const chunk of result.textStream) {
        if (signal.aborted) break
        accumulated += chunk
        updateMessageContent(chatId, assistantMessageId, accumulated)
      }
    } catch (error) {
      // Don't show error if user cancelled
      if (signal.aborted) return
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
    addCustomModel(customUrl)
    setCustomUrl('')
    setShowCustomInput(false)
  }

  // Track model availability (e.g. Apple Intelligence not enabled)
  const [availability, setAvailability] = useState<Availability>('no')
  useEffect(() => {
    if (!selectedAdapter) {
      setAvailability('no')
      return
    }
    let mounted = true
    selectedAdapter.isAvailable().then((result) => {
      if (mounted) setAvailability(result)
    })
    return () => {
      mounted = false
    }
  }, [selectedAdapter])

  const isModelUnavailable = !selectedAdapter || availability === 'no'

  // Prepare and unload model when selected
  useEffect(() => {
    if (!selectedAdapter || availability !== 'yes') return
    selectedAdapter.prepare()
    return () => {
      selectedAdapter.unload()
    }
  }, [selectedAdapter, availability])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <AdaptiveGlass isInteractive style={styles.headerButton}>
            <Pressable
              onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
              style={styles.headerButtonPressable}
            >
              <SymbolView
                name="line.3.horizontal"
                size={20}
                tintColor={colors.label}
                resizeMode="scaleAspectFit"
              />
            </Pressable>
          </AdaptiveGlass>

          <Pressable
            onPress={() => modelSheetRef.current?.present()}
            style={styles.headerTitleContainer}
          >
            <Text style={styles.headerTitle}>
              {currentChat?.title ?? 'New Chat'}
            </Text>
            <View style={styles.headerSubtitleRow}>
              <Text style={styles.headerSubtitle}>
                {selectedModelDownloadProgress !== undefined
                  ? `Downloading... ${selectedModelDownloadProgress}%`
                  : (selectedAdapter?.display.label ?? 'No model')}
              </Text>
              <SymbolView
                name="chevron.down"
                size={12}
                tintColor={colors.secondaryLabel}
                resizeMode="scaleAspectFit"
              />
            </View>
          </Pressable>

          <AdaptiveGlass isInteractive style={styles.headerButton}>
            <Pressable
              onPress={() => settingsSheetRef.current?.present()}
              style={styles.headerButtonPressable}
            >
              <SymbolView
                name="slider.horizontal.3"
                size={20}
                tintColor={colors.label}
                resizeMode="scaleAspectFit"
              />
            </Pressable>
          </AdaptiveGlass>
        </View>

        {/* Model Unavailable State */}
        {isModelUnavailable ? (
          <View style={styles.unavailableContainer}>
            <AdaptiveGlass style={styles.emptyStateIcon}>
              <View style={styles.emptyStateIconInner}>
                <SymbolView
                  name="exclamationmark.triangle"
                  size={32}
                  tintColor={colors.systemYellow}
                  resizeMode="scaleAspectFit"
                />
              </View>
            </AdaptiveGlass>
            <Text style={styles.emptyStateTitle}>Model Not Available</Text>
            <Text style={styles.emptyStateSubtitle}>
              {selectedAdapter?.display.label ?? 'The selected model'} is not
              available on this device. Please choose a different model.
            </Text>
            <Pressable
              onPress={() => modelSheetRef.current?.present()}
              style={styles.chooseModelButton}
            >
              <Text style={styles.chooseModelText}>Choose Model</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Messages */}
            <ScrollView
              ref={scrollRef}
              style={styles.messagesContainer}
              contentContainerStyle={styles.messagesContent}
            >
              {(currentChat?.messages.length ?? 0) === 0 ? (
                <View style={styles.emptyState}>
                  <AdaptiveGlass style={styles.emptyStateIcon}>
                    <View style={styles.emptyStateIconInner}>
                      <SymbolView
                        name="sparkles"
                        size={32}
                        tintColor={colors.systemBlue}
                        resizeMode="scaleAspectFit"
                      />
                    </View>
                  </AdaptiveGlass>
                  <Text style={styles.emptyStateTitle}>
                    What can I help you with?
                  </Text>
                  <Text style={styles.emptyStateSubtitle}>
                    {`Start a conversation with ${selectedAdapter.display.label}. Ask questions, get creative, or explore ideas.`}
                  </Text>
                </View>
              ) : (
                currentChat?.messages.map((message) => {
                  const isUser = message.role === 'user'
                  return (
                    <View
                      key={message.id}
                      style={[
                        styles.messageRow,
                        isUser
                          ? styles.messageRowUser
                          : styles.messageRowAssistant,
                      ]}
                    >
                      <View
                        style={[
                          styles.messageBubble,
                          isUser
                            ? styles.messageBubbleUser
                            : styles.messageBubbleAssistant,
                        ]}
                      >
                        <Text
                          selectable
                          style={[
                            styles.messageText,
                            isUser
                              ? styles.messageTextUser
                              : styles.messageTextAssistant,
                          ]}
                        >
                          {message.content}
                        </Text>
                      </View>
                    </View>
                  )
                })
              )}
            </ScrollView>

            {/* Input Bar */}
            <AdaptiveGlass style={styles.inputBar}>
              <Reanimated.View
                style={[styles.inputBarInner, inputBarBottomPadding]}
              >
                <View style={styles.inputRow}>
                  <AdaptiveGlass isInteractive style={styles.plusButton}>
                    <Host matchContents>
                      <ContextMenu activationMethod="singlePress">
                        <ContextMenu.Items>
                          <Button
                            systemImage="camera"
                            onPress={() => console.log('Take Photo')}
                          >
                            Take Photo
                          </Button>
                          <Button
                            systemImage="photo.on.rectangle"
                            onPress={() => console.log('Photo Library')}
                          >
                            Photo Library
                          </Button>
                        </ContextMenu.Items>
                        <ContextMenu.Trigger>
                          <Button
                            systemImage="plus"
                            variant="borderless"
                            color="#000"
                          />
                        </ContextMenu.Trigger>
                      </ContextMenu>
                    </Host>
                  </AdaptiveGlass>

                  <View style={styles.textInputContainer}>
                    <TextInput
                      value={input}
                      onChangeText={setInput}
                      placeholder="Message"
                      placeholderTextColor={colors.placeholderText as any}
                      multiline
                      blurOnSubmit={false}
                      style={styles.textInput}
                      editable={!isGenerating}
                    />
                  </View>

                  {input.trim() ? (
                    <Pressable
                      onPress={handleSend}
                      disabled={isGenerating}
                      style={styles.sendButton}
                    >
                      <SymbolView
                        name="arrow.up"
                        size={20}
                        tintColor="#fff"
                        resizeMode="scaleAspectFit"
                      />
                    </Pressable>
                  ) : (
                    <RecordButton
                      onTranscriptionComplete={(text) =>
                        setInput((prev) => (prev ? `${prev} ${text}` : text))
                      }
                      disabled={isGenerating}
                    />
                  )}
                </View>
              </Reanimated.View>
            </AdaptiveGlass>
          </>
        )}
      </View>

      {/* Model Picker Sheet */}
      <TrueSheet ref={modelSheetRef} scrollable>
        <View style={styles.sheetContainer}>
          <ScrollView nestedScrollEnabled>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Choose Model</Text>
            </View>
            {Array.from(adaptersByProvider.entries()).map(
              ([providerLabel, adapters], index) => (
                <View
                  key={providerLabel}
                  style={index > 0 && styles.modelListSpacing}
                >
                  <Text style={styles.sectionLabel}>{providerLabel}</Text>
                  <View style={styles.modelList}>
                    {adapters.map((adapter, adapterIndex) => (
                      <ModelItem
                        key={adapter.modelId}
                        adapter={adapter}
                        isSelected={selectedModelId === adapter.modelId}
                        onSelect={handleModelSelect}
                        isFirst={adapterIndex === 0}
                        isLast={adapterIndex === adapters.length - 1}
                      />
                    ))}
                  </View>
                </View>
              )
            )}
            <View style={styles.customModelSection}>
              {showCustomInput ? (
                <>
                  <Text style={styles.customModelInputTitle}>
                    Add from Hugging Face
                  </Text>
                  <View style={styles.customModelInput}>
                    <TextInput
                      value={customUrl}
                      onChangeText={setCustomUrl}
                      placeholder="Enter Hugging Face model URL"
                      placeholderTextColor={colors.placeholderText as any}
                      style={styles.customModelUrlInput}
                    />
                  </View>
                  <View style={styles.customModelButtons}>
                    <Pressable
                      onPress={() => setShowCustomInput(false)}
                      style={styles.customModelCancelButton}
                    >
                      <Text style={styles.customModelCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleAddCustomModel}
                      disabled={!customUrl.trim()}
                      style={[
                        styles.customModelAddButton,
                        !customUrl.trim() &&
                          styles.customModelAddButtonDisabled,
                      ]}
                    >
                      <Text style={styles.customModelAddText}>Add Model</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable
                  onPress={() => setShowCustomInput(true)}
                  style={styles.addCustomModelButton}
                >
                  <View style={styles.addCustomModelIcon}>
                    <SymbolView
                      name="link"
                      size={18}
                      tintColor={colors.secondaryLabel}
                      resizeMode="scaleAspectFit"
                    />
                  </View>
                  <Text style={styles.addCustomModelText}>
                    Add Custom Model from Hugging Face
                  </Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </TrueSheet>

      {/* Settings Sheet */}
      <TrueSheet ref={settingsSheetRef} scrollable>
        <View style={styles.sheetContainer}>
          <ScrollView nestedScrollEnabled>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Tools & Settings</Text>
            </View>
            <Text style={styles.sectionLabel}>Tools</Text>
            <View style={styles.toolsList}>
              {Object.entries(toolDefinitions).map(([id, tool], index, arr) => {
                const enabled = enabledToolIds.includes(id)
                const isFirst = index === 0
                const isLast = index === arr.length - 1
                return (
                  <Pressable
                    key={id}
                    onPress={() => toggleTool(id)}
                    style={[
                      styles.toolItem,
                      isFirst && styles.toolItemFirst,
                      isLast && styles.toolItemLast,
                    ]}
                  >
                    <View
                      style={[
                        styles.toolItemContent,
                        !isLast && styles.toolItemContentBorder,
                      ]}
                    >
                      <View style={styles.toolItemTextContainer}>
                        <Text style={styles.toolItemTitle}>{tool.title}</Text>
                        <Text style={styles.toolItemDescription}>
                          {tool.description}
                        </Text>
                      </View>
                      {enabled && (
                        <SymbolView
                          name="checkmark"
                          size={20}
                          tintColor={colors.systemBlue}
                          resizeMode="scaleAspectFit"
                        />
                      )}
                    </View>
                  </Pressable>
                )
              })}
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.sectionLabel}>Model Settings</Text>
              <View style={styles.settingsCard}>
                <View style={styles.settingRowSlider}>
                  <View style={styles.settingSliderHeader}>
                    <Text style={styles.settingTitle}>Temperature</Text>
                    <Text style={styles.settingValue}>
                      {temperature.toFixed(1)}
                    </Text>
                  </View>
                  <Host style={styles.sliderHost}>
                    <Slider
                      value={temperature}
                      min={0}
                      max={2}
                      onValueChange={(value) =>
                        updateChatSettings({
                          temperature: Math.round(value * 10) / 10,
                        })
                      }
                    />
                  </Host>
                </View>
                <View style={styles.settingRowSliderWithBorder}>
                  <View style={styles.settingSliderHeader}>
                    <Text style={styles.settingTitle}>Max Steps</Text>
                    <Text style={styles.settingValue}>{maxSteps}</Text>
                  </View>
                  <Host style={styles.sliderHost}>
                    <Slider
                      value={maxSteps}
                      min={1}
                      max={20}
                      steps={19}
                      onValueChange={(value) =>
                        updateChatSettings({ maxSteps: Math.round(value) })
                      }
                    />
                  </Host>
                </View>
              </View>
              <Text style={styles.settingsFooter}>
                Temperature controls response randomness. Max steps limits tool
                call iterations.
              </Text>
            </View>
          </ScrollView>
        </View>
      </TrueSheet>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.systemBackground as any,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator as any,
  },
  headerButton: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerButtonPressable: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.label as any,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.secondaryLabel as any,
  },

  // Messages
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    padding: 16,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  messageBubbleUser: {
    backgroundColor: colors.systemBlue as any,
  },
  messageBubbleAssistant: {
    backgroundColor: colors.secondarySystemBackground as any,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageTextUser: {
    color: '#fff',
  },
  messageTextAssistant: {
    color: colors.label as any,
  },

  // Empty State
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyStateIcon: {
    borderRadius: 40,
    overflow: 'hidden',
  },
  emptyStateIconInner: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateTitle: {
    marginTop: 24,
    fontSize: 22,
    fontWeight: '600',
    color: colors.label as any,
  },
  emptyStateSubtitle: {
    marginTop: 8,
    maxWidth: 280,
    textAlign: 'center',
    fontSize: 15,
    color: colors.secondaryLabel as any,
  },

  // Unavailable State
  unavailableContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  chooseModelButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: colors.systemBlue as any,
  },
  chooseModelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },

  // Input Bar
  inputBar: {},
  inputBarInner: {
    padding: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  plusButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: colors.tertiarySystemFill as any,
    paddingHorizontal: 16,
    minHeight: 40,
  },
  textInput: {
    flex: 1,
    fontSize: 17,
    color: colors.label as any,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginBottom: 2,
    backgroundColor: colors.systemBlue as any,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sheet Common
  sheetContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  sheetHeader: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  sheetTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.label as any,
    letterSpacing: 0.34,
  },
  sectionLabel: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    fontSize: 13,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: -0.08,
    color: colors.secondaryLabel as any,
  },
  sectionLabelSpacing: {
    marginTop: 32,
  },

  // Model Picker
  modelList: {
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.secondarySystemBackground as any,
    overflow: 'hidden',
  },
  modelListSpacing: {
    marginTop: 16,
  },
  modelItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    backgroundColor: colors.secondarySystemBackground as any,
  },
  modelItemFirst: {
    // First item styling (handled by parent container border radius)
  },
  modelItemLast: {
    // Last item styling (handled by parent container border radius)
  },
  modelIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelItemInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    paddingRight: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  modelItemInfoBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator as any,
  },
  modelItemTextContainer: {
    flex: 1,
  },
  modelItemLabel: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.label as any,
  },
  modelItemLabelUnavailable: {
    color: colors.tertiaryLabel as any,
  },
  downloadProgressContainer: {
    marginTop: 6,
  },
  downloadProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.tertiarySystemFill as any,
    overflow: 'hidden',
  },
  downloadProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.systemBlue as any,
  },
  downloadProgressText: {
    marginTop: 4,
    fontSize: 13,
    color: colors.secondaryLabel as any,
  },
  modelStatusText: {
    marginTop: 2,
    fontSize: 13,
    color: colors.secondaryLabel as any,
  },
  modelItemTrailing: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  // Delete Action
  deleteActionContainer: {
    width: 72,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.systemRed as any,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Custom Model
  customModelSection: {
    marginTop: 32,
  },
  customModelInput: {
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.secondarySystemBackground as any,
    overflow: 'hidden',
  },
  customModelInputTitle: {
    fontSize: 13,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: -0.08,
    color: colors.secondaryLabel as any,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  customModelUrlInput: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.label as any,
  },
  customModelButtons: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  customModelCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.tertiarySystemFill as any,
    alignItems: 'center',
  },
  customModelCancelText: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.label as any,
  },
  customModelAddButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.systemBlue as any,
    alignItems: 'center',
  },
  customModelAddButtonDisabled: {
    backgroundColor: colors.tertiarySystemFill as any,
  },
  customModelAddText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  addCustomModelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.secondarySystemBackground as any,
  },
  addCustomModelIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.tertiarySystemFill as any,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCustomModelText: {
    flex: 1,
    marginLeft: 12,
    paddingVertical: 16,
    paddingRight: 16,
    fontSize: 17,
    fontWeight: '400',
    color: colors.label as any,
  },

  // Settings
  toolsList: {
    marginTop: 8,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.secondarySystemBackground as any,
    overflow: 'hidden',
  },
  toolItem: {
    paddingLeft: 16,
    backgroundColor: colors.secondarySystemBackground as any,
  },
  toolItemFirst: {
    // First item styling (handled by parent container border radius)
  },
  toolItemLast: {
    // Last item styling (handled by parent container border radius)
  },
  toolItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
    minHeight: 56,
  },
  toolItemContentBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator as any,
  },
  toolItemTextContainer: {
    flex: 1,
  },
  toolItemTitle: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.label as any,
  },
  toolItemDescription: {
    marginTop: 2,
    fontSize: 13,
    color: colors.secondaryLabel as any,
  },
  settingsSection: {
    marginTop: 32,
  },
  settingsCard: {
    marginTop: 8,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.secondarySystemBackground as any,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  settingRowWithBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator as any,
  },
  settingRowSlider: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  settingRowSliderWithBorder: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator as any,
  },
  settingSliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  settingTitle: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.label as any,
  },
  settingValue: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.secondaryLabel as any,
  },
  sliderHost: {
    height: 30,
  },
  settingInput: {
    width: 70,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.tertiarySystemFill as any,
    fontSize: 17,
    fontWeight: '400',
    textAlign: 'center',
    color: colors.label as any,
  },
  settingsFooter: {
    marginTop: 8,
    paddingHorizontal: 16,
    fontSize: 13,
    color: colors.secondaryLabel as any,
    lineHeight: 18,
  },
})
