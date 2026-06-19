import type { TrueSheet } from '@lodev09/react-native-true-sheet'
import {
  type AppleLanguageModel,
  type AppleLanguageModelId,
  createAppleProvider,
} from '@react-native-ai/apple'
import {
  buildGenUISystemPrompt,
  createGenUITools,
} from '@react-native-ai/json-ui'
import { stepCountIs, streamText } from 'ai'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { getChatUISpecFromChats, useChatStore } from '../../store/chatStore'
import { useProviderStore } from '../../store/providerStore'
import { colors } from '../../theme/colors'
import {
  setToolExecutionReporter,
  toolDefinitions,
  withToolProxy,
} from '../../tools'
import { getAiSdkTelemetry } from '../../utils/aiSdkTelemetry'
import { ChatHeader } from './ChatHeader'
import { ChatMessages } from './ChatMessages'
import { ModelAvailableForDownload } from './ModelAvailableForDownload'
import { ModelPickerSheet } from './ModelPickerSheet'
import { ModelUnavailable } from './ModelUnavailable'
import { SettingsSheet } from './SettingsSheet'

export default function ChatScreen() {
  const {
    chats,
    currentChat,
    chatSettings,
    addMessages,
    addToolExecutionMessage,
    updateMessageContent,
    updateChatUISpec,
  } = useChatStore()
  const chatsRef = useRef(chats)
  chatsRef.current = chats
  const getSpec = useCallback(
    (chatId: string) => getChatUISpecFromChats(chatsRef.current, chatId),
    []
  )
  const { adapters, availability } = useProviderStore()

  const {
    modelId: selectedModelId,
    temperature,
    maxSteps,
    enabledToolIds,
    genUiEnabled,
    appleHistoryDemoEnabled,
    appleHistoryWindowEntries,
    appleHistorySummarizationThreshold,
  } = chatSettings

  const [isGenerating, setIsGenerating] = useState(false)

  const modelSheetRef = useRef<TrueSheet>(null)
  const settingsSheetRef = useRef<TrueSheet>(null)
  const abortControllerRef = useRef<AbortController>(null)

  const selectedAdapter = adapters.find(
    (adapter) => adapter.modelId === selectedModelId
  )

  const selectedModelAvailability = availability.get(selectedModelId)

  // Send message and stream AI response
  const handleSend = async (userInput: string) => {
    if (isGenerating || !selectedAdapter) return

    // Cancel any previous generation
    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()
    const { signal } = abortControllerRef.current

    const baseMessages = currentChat?.messages ?? []
    const { chatId, messageIds } = addMessages([
      { role: 'user', content: userInput },
      { role: 'assistant', content: '...' },
    ])
    const assistantMessageId = messageIds[1]
    setIsGenerating(true)

    try {
      const genUITools = genUiEnabled
        ? createGenUITools({
            contextId: chatId,
            getSpec,
            updateSpec: updateChatUISpec,
            toolWrapper: withToolProxy as any,
          })
        : {}
      const tools = {
        ...Object.fromEntries(
          enabledToolIds
            .filter((id) => toolDefinitions[id])
            .map((id) => [id, toolDefinitions[id]])
        ),
        ...genUITools,
      }
      let model = selectedAdapter.model
      if (appleHistoryDemoEnabled && model.provider === 'apple') {
        const modelId = model.modelId as AppleLanguageModelId
        const appleProvider = createAppleProvider({
          availableTools: tools,
          model: modelId,
          context: {
            summarizeHistory: {
              threshold: appleHistorySummarizationThreshold,
              model: createAppleProvider({
                model: modelId,
              }).languageModel(),
            },
            rollingWindowMessages: appleHistoryWindowEntries,
            dropCompletedToolCalls: true,
          },
        })
        model = appleProvider.languageModel()
      }

      if ('updateTools' in model) {
        ;(model as AppleLanguageModel).updateTools(tools)
      }
      setToolExecutionReporter(({ toolName, args, result }) => {
        addToolExecutionMessage(chatId, toolName, args, result)
      })
      let streamError: unknown
      const result = streamText({
        model,
        messages: [
          ...baseMessages
            .filter((message) => message.type !== 'toolExecution')
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
          { role: 'user', content: userInput },
        ],
        tools,
        temperature,
        stopWhen: stepCountIs(maxSteps),
        abortSignal: signal,
        experimental_telemetry: getAiSdkTelemetry('chat-screen-stream-text'),
        system: genUiEnabled
          ? buildGenUISystemPrompt({
              additionalInstructions:
                'If the user asks, tell who you are (assistant) and what is this (Callstack AI demo app).',
            })
          : 'You are a helpful assistant. If the user asks, tell who you are (assistant) and what is this (Callstack AI demo app).',
        onError: ({ error }) => {
          streamError = error
        },
      })

      let accumulated = ''
      for await (const chunk of result.textStream) {
        if (signal.aborted) break
        if (!chunk) continue
        accumulated += chunk
        updateMessageContent(chatId, assistantMessageId, accumulated)
      }

      if (streamError) throw streamError

      if (accumulated.trim().length === 0) {
        updateMessageContent(
          chatId,
          assistantMessageId,
          'The LLM did not yield a response. Please try again.'
        )
      }
    } catch (error) {
      // Don't show error if user cancelled
      if (signal.aborted) return
      const message =
        error instanceof Error ? error.message : 'Failed to generate response'
      updateMessageContent(chatId, assistantMessageId, `Error: ${message}`)
      abortControllerRef.current?.abort()
    } finally {
      setToolExecutionReporter(null)
      setIsGenerating(false)
    }
  }

  // Cleanup streaming on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  // Prepare and unload model when selected
  useEffect(() => {
    if (!selectedAdapter || selectedModelAvailability !== 'yes') return
    selectedAdapter.prepare()
    return () => {
      selectedAdapter.unload()
    }
  }, [selectedAdapter, selectedModelAvailability])

  const headerSubtitle = selectedAdapter?.display.label ?? 'No model selected'
  const showAppleTokenCount =
    selectedAdapter?.model.provider === 'apple' &&
    selectedModelAvailability === 'yes'
  const emptyStateSubtitle = genUiEnabled
    ? `Start a conversation with ${headerSubtitle}. Ask questions, ask it to add new UI elements to the screen, get creative, or explore ideas.${appleHistoryDemoEnabled ? ' Apple History Demo is enabled, so this chat also exercises summarizeHistory, rollingWindow, and droppingCompletedToolCalls.' : ''}`
    : `Start a conversation with ${headerSubtitle}. Ask questions, get creative, or explore ideas.${appleHistoryDemoEnabled ? ' Apple History Demo is enabled, so this chat also exercises summarizeHistory, rollingWindow, and droppingCompletedToolCalls.' : ''}`

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.container}>
        <ChatHeader
          title={currentChat?.title ?? 'New Chat'}
          subtitle={headerSubtitle}
          onOpenModelSheet={() => modelSheetRef.current?.present()}
          onOpenSettingsSheet={() => settingsSheetRef.current?.present()}
        />
        {!selectedAdapter || selectedModelAvailability === 'no' ? (
          <ModelUnavailable
            onChooseModel={() => modelSheetRef.current?.present()}
          />
        ) : selectedModelAvailability === 'availableForDownload' ? (
          <ModelAvailableForDownload />
        ) : (
          <ChatMessages
            messages={currentChat?.messages ?? []}
            selectedModelLabel={selectedAdapter.display.label}
            emptyStateSubtitle={emptyStateSubtitle}
            onSend={handleSend}
            isGenerating={isGenerating}
            genUiEnabled={genUiEnabled}
            showAppleTokenCount={showAppleTokenCount}
          />
        )}
      </View>
      <ModelPickerSheet ref={modelSheetRef} />
      <SettingsSheet ref={settingsSheetRef} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.systemBackground as any,
  },
})
