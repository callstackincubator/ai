import { streamText } from 'ai'
import React, { useCallback, useEffect, useState } from 'react'
import {
  Keyboard,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { GiftedChat, type IMessage } from 'react-native-gifted-chat'
import 'react-native-get-random-values'
import { v4 as uuid } from 'uuid'

import { createAppleProvider } from '@react-native-ai/apple'

import {
  checkBattery,
  checkCalendarEvents,
  createCalendarEvent,
} from '../tools'

const apple = createAppleProvider({
  availableTools: {
    checkBattery,
    createCalendarEvent,
    checkCalendarEvents,
  },
})

const aiBot = {
  _id: 2,
  name: 'Apple Intelligence',
  // avatar: require('../../assets/avatar.png'),
}

export default function LLMScreen() {
  const [displayedMessages, setDisplayedMessages] = useState<IMessage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const [currentStreamingMessageId, setCurrentStreamingMessageId] = useState<
    string | null
  >(null)

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      () => {
        setIsKeyboardVisible(true)
      }
    )
    const keyboardWillHideListener = Keyboard.addListener(
      'keyboardWillHide',
      () => {
        setIsKeyboardVisible(false)
      }
    )

    return () => {
      keyboardWillShowListener.remove()
      keyboardWillHideListener.remove()
    }
  }, [])

  const createInitialBotMessage = useCallback(() => {
    const messageId = uuid()
    setCurrentStreamingMessageId(messageId)

    const newMessage: IMessage = {
      _id: messageId,
      text: '...',
      createdAt: new Date(),
      user: aiBot,
    }

    setDisplayedMessages((previousMessages) =>
      GiftedChat.append(previousMessages, [newMessage])
    )

    return messageId
  }, [])

  const updateStreamingMessage = useCallback(
    (messageId: string, text: string) => {
      setDisplayedMessages((previousMessages) =>
        previousMessages.map((message) =>
          message._id === messageId ? { ...message, text } : message
        )
      )
    },
    []
  )

  const sendMessageToAI = useCallback(
    async (userMessage: IMessage) => {
      if (isGenerating) return

      setIsGenerating(true)

      // Create initial bot message with loading indicator
      const messageId = createInitialBotMessage()
      let accumulatedText = ''

      try {
        // Convert GiftedChat messages to AI SDK format
        const aiMessages = displayedMessages
          .slice()
          .reverse()
          .map((message) => ({
            role:
              message.user._id === 2
                ? ('assistant' as const)
                : ('user' as const),
            content: message.text,
          }))

        // Add the new user message
        aiMessages.push({
          role: 'user' as const,
          content: userMessage.text,
        })

        const result = streamText({
          model: apple(),
          messages: aiMessages,
          tools: {
            checkBattery,
            createCalendarEvent,
            checkCalendarEvents,
          },
        })

        for await (const chunk of result.textStream) {
          accumulatedText += chunk
          updateStreamingMessage(messageId, accumulatedText)
        }
      } catch (error) {
        const errorMessage = `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`
        updateStreamingMessage(messageId, errorMessage)
      } finally {
        setIsGenerating(false)
        setCurrentStreamingMessageId(null)
      }
    },
    [
      displayedMessages,
      isGenerating,
      createInitialBotMessage,
      updateStreamingMessage,
    ]
  )

  const onSend = useCallback(
    (newMessages: IMessage[]) => {
      if (newMessages[0]) {
        setDisplayedMessages((previousMessages) =>
          GiftedChat.append(previousMessages, newMessages)
        )
        sendMessageToAI(newMessages[0])
      }
    },
    [sendMessageToAI]
  )

  return (
    <View
      style={[styles.container, !isKeyboardVisible && { paddingBottom: 100 }]}
    >
      <GiftedChat
        messages={displayedMessages}
        onSend={onSend}
        renderAvatar={() => null}
        user={{ _id: 1 }}
        keyboardShouldPersistTaps="handled"
        renderBubble={(props) => (
          <View
            style={[
              styles.bubble,
              props.currentMessage?.user._id === 1
                ? styles.userBubble
                : styles.botBubble,
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                props.currentMessage?.user._id === 1
                  ? styles.userBubbleText
                  : styles.botBubbleText,
              ]}
            >
              {props.currentMessage?.text}
            </Text>
          </View>
        )}
        renderSend={(props) => (
          <TouchableOpacity
            style={[
              styles.sendButton,
              props.text?.trim() && !isGenerating
                ? styles.sendButtonActive
                : styles.sendButtonInactive,
            ]}
            onPress={() => {
              if (props.text && props.onSend) {
                props.onSend({ text: props.text.trim() }, true)
              }
            }}
            disabled={!props.text?.trim() || isGenerating}
          >
            <Text
              style={[
                styles.sendButtonText,
                props.text?.trim() && !isGenerating
                  ? styles.sendButtonTextActive
                  : styles.sendButtonTextInactive,
              ]}
            >
              ↑
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  headerSubtitle: {
    textAlign: 'center',
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    transform: [{ scaleY: -1 }],
    justifyContent: 'center',
    alignItems: 'center',
  },
  exampleContainer: {
    transform: [{ scaleY: -1 }],
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  exampleTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  exampleSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  exampleButton: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  exampleButtonText: {
    color: '#1d4ed8',
    textAlign: 'center',
    fontWeight: '500',
  },
  bubble: {
    marginVertical: 2,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  userBubble: {
    backgroundColor: '#3b82f6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 4,
    alignSelf: 'flex-end',
  },
  botBubble: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 24,
    alignSelf: 'flex-start',
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 20,
  },
  userBubbleText: {
    color: '#ffffff',
  },
  botBubbleText: {
    color: '#1f2937',
  },
  sendButton: {
    width: 33,
    height: 33,
    marginBottom: 5,
    marginRight: 5,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  sendButtonActive: {
    backgroundColor: '#3b82f6',
  },
  sendButtonInactive: {
    backgroundColor: '#d1d5db',
  },
  sendButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  sendButtonTextActive: {
    color: '#ffffff',
  },
  sendButtonTextInactive: {
    color: '#6b7280',
  },
})
