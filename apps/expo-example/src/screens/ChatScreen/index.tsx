import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { stepCountIs, streamText } from 'ai'
import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useChatStore } from '../../store/chatStore'
import { useProviderStore } from '../../store/providerStore'
import { colors } from '../../theme/colors'
import { toolDefinitions } from '../../tools'
import { ChatHeader } from './ChatHeader'
import { ChatMessages } from './ChatMessages'
import { ModelAvailableForDownload } from './ModelAvailableForDownload'
import { ModelPickerSheet } from './ModelPickerSheet'
import { ModelUnavailable } from './ModelUnavailable'
import { SettingsSheet } from './SettingsSheet'

export default function ChatScreen() {
  const { currentChat, chatSettings, addMessages, updateMessageContent } =
    useChatStore()
  const { adapters, availability } = useProviderStore()

  const {
    modelId: selectedModelId,
    temperature,
    maxSteps,
    enabledToolIds,
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
      const result = streamText({
        model: selectedAdapter.model,
        messages: [
          ...baseMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          { role: 'user', content: userInput },
        ],
        tools: Object.fromEntries(
          enabledToolIds
            .filter((id) => toolDefinitions[id])
            .map((id) => [id, toolDefinitions[id]])
        ),
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
            onSend={handleSend}
            isGenerating={isGenerating}
            selectedModelLabel={selectedAdapter.display.label}
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
