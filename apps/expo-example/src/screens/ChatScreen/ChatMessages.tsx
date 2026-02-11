import { GenerativeUIView } from 'json-ui-lite-rn'
import React, { useEffect, useRef } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useKeyboardHandler } from 'react-native-keyboard-controller'
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'

import { getChatUISpecFromChats, useChatStore } from '../../store/chatStore'
import { ChatEmptyState } from './ChatEmptyState'
import { ChatInputBar } from './ChatInputBar'
import { ChatMessageBubble } from './ChatMessageBubble'

type ChatMessage = {
  id: string
  role: string
  content: string
  type?: 'text' | 'toolExecution'
  toolExecution?: {
    toolName: string
    payload: unknown
    result?: unknown
  }
}

type ChatMessagesProps = {
  messages: ChatMessage[]
  selectedModelLabel: string
  onSend: (message: string) => void
  isGenerating: boolean
}

export function ChatMessages({
  messages,
  selectedModelLabel,
  onSend,
  isGenerating,
}: ChatMessagesProps) {
  const ref = useRef<ScrollView>(null)

  const insets = useSafeAreaInsets()
  const keyboardHeight = useSharedValue(insets.bottom)

  const scrollToBottom = () => {
    ref.current?.scrollToEnd({ animated: true })
  }

  useKeyboardHandler(
    {
      onMove: (event) => {
        'worklet'
        keyboardHeight.value = Math.max(event.height, insets.bottom)
      },
      onEnd: (event) => {
        'worklet'
        // tbd
        keyboardHeight.value = Math.max(event.height, insets.bottom)
        scheduleOnRN(scrollToBottom)
      },
    },
    [insets.bottom, scrollToBottom]
  )

  const inputBarBottomPadding = useAnimatedStyle(() => ({
    paddingBottom: keyboardHeight.value,
  }))

  useEffect(scrollToBottom, [messages.length])

  const { chats, currentChatId } = useChatStore()

  return (
    <>
      <ScrollView
        ref={ref}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 ? (
          <ChatEmptyState
            title="What can I help you with?"
            subtitle={`Start a conversation with ${selectedModelLabel}. Ask questions, ask it to add new UI elements to the screen, get creative, or explore ideas.`}
          />
        ) : (
          <View style={styles.messageList}>
            {messages.map((message) => (
              <ChatMessageBubble
                key={message.id}
                content={message.content}
                isUser={message.role === 'user'}
                messageType={message.type}
                toolExecution={message.toolExecution}
              />
            ))}

            <GenerativeUIView
              spec={
                currentChatId
                  ? getChatUISpecFromChats(chats, currentChatId)
                  : null
              }
              loading={isGenerating}
              showCollapsibleJSON
            />
          </View>
        )}
      </ScrollView>
      <Reanimated.View style={inputBarBottomPadding}>
        <ChatInputBar onSend={onSend} isGenerating={isGenerating} />
      </Reanimated.View>
    </>
  )
}

const styles = StyleSheet.create({
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    padding: 16,
    gap: 12,
  },
  messageList: {
    gap: 12,
  },
})
