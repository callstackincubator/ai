import { createAppleProvider } from '@react-native-ai/apple'
import { ModelMessage, streamText } from 'ai'
import React, { useEffect, useRef, useState } from 'react'
import {
  Keyboard,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useBottomTabBarHeight } from 'react-native-bottom-tabs'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'

import {
  checkCalendarEvents,
  createCalendarEvent,
  getCurrentTime,
} from '../../../tools'

const apple = createAppleProvider({
  availableTools: {
    getCurrentTime,
    createCalendarEvent,
    checkCalendarEvents,
  },
})

export default function AppleLLMScreen() {
  const [messages, setMessages] = useState<ModelMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const scrollViewRef = useRef<ScrollView>(null)

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      () => {
        scrollViewRef.current?.scrollToEnd({ animated: true })
      }
    )
    return () => {
      keyboardWillShowListener.remove()
    }
  }, [])

  const sendMessage = async () => {
    if (!inputText.trim() || isGenerating) return

    const userMessage: ModelMessage = {
      role: 'user',
      content: inputText.trim(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInputText('')
    setIsGenerating(true)

    const messageIdx = updatedMessages.length

    setMessages([
      ...updatedMessages,
      {
        role: 'assistant',
        content: '...',
      },
    ])

    let accumulatedContent = ''

    try {
      const result = streamText({
        model: apple(),
        messages: updatedMessages,
        tools: {
          getCurrentTime,
          createCalendarEvent,
          checkCalendarEvents,
        },
      })

      for await (const chunk of result.textStream) {
        accumulatedContent += chunk
        setMessages((prev) => {
          const newMessages = [...prev]
          newMessages[messageIdx] = {
            role: 'assistant',
            content: accumulatedContent,
          }
          return newMessages
        })
      }
    } catch (error) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`
      setMessages((prev) => {
        const newMessages = [...prev]
        newMessages[messageIdx] = {
          role: 'assistant',
          content: errorMessage,
        }
        return newMessages
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const bottomTabBarHeight = useBottomTabBarHeight()
  const keyboardAnimation = useReanimatedKeyboardAnimation()

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          keyboardAnimation.progress.value === 0
            ? -bottomTabBarHeight
            : keyboardAnimation.height.value,
      },
    ],
  }))

  return (
    <Animated.View
      className="flex-1"
      style={[{ marginTop: bottomTabBarHeight }, animatedStyle]}
    >
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 p-4"
        onContentSizeChange={() => {
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }}
      >
        {messages.map((message, index) => (
          <View
            key={index}
            className={`flex-row mb-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <View
              className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                message.role === 'user' ? 'bg-blue-500' : 'bg-gray-100'
              }`}
            >
              <Text
                className={
                  message.role === 'user' ? 'text-white' : 'text-gray-900'
                }
              >
                {message.content as string}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View className="flex-row items-center p-4 border-t border-gray-200">
        <TextInput
          className="flex-1 bg-gray-100 rounded-full px-4 py-2 mr-2"
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#9CA3AF"
          onSubmitEditing={sendMessage}
          editable={!isGenerating}
        />
        <TouchableOpacity
          className={`w-10 h-10 rounded-full justify-center items-center ${
            inputText.trim() && !isGenerating ? 'bg-blue-500' : 'bg-gray-300'
          }`}
          onPress={sendMessage}
          disabled={!inputText.trim() || isGenerating}
        >
          <Text
            className={
              inputText.trim() && !isGenerating
                ? 'text-white font-bold'
                : 'text-gray-500 font-bold'
            }
          >
            ↑
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  )
}
