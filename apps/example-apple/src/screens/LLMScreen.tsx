import { createAppleProvider } from '@react-native-ai/apple'
import { generateText } from 'ai'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import {
  checkBattery,
  checkCalendarEvents,
  createCalendarEvent,
} from '../tools'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const EXAMPLE_MESSAGES = [
  'What is on my agenda this week?',
  'How much battery I have left?',
  'Who founded Apple?',
]

const apple = createAppleProvider({
  availableTools: {
    checkBattery,
    createCalendarEvent,
    checkCalendarEvents,
  },
})

export default function LLMScreen() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isGenerating) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputText('')
    setIsGenerating(true)

    try {
      const result = await generateText({
        model: apple(),
        messages: [...messages, { role: 'user', content: messageText.trim() }],
        tools: {
          checkBattery,
          createCalendarEvent,
          checkCalendarEvents,
        },
      })

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.text,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to generate response'
      )
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <Text className="text-center mb-6">
        Start a conversation with Apple Intelligence
      </Text>
      <View className="flex-1 p-4">
        {messages.map((message) => (
          <View
            key={message.id}
            className={`mb-4 p-3 border ${
              message.role === 'user'
                ? 'border-gray-400 self-end max-w-[80%]'
                : 'border-gray-300 self-start max-w-[80%]'
            }`}
          >
            <Text className="mb-1">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </Text>
            <Text>{message.content}</Text>
          </View>
        ))}

        {isGenerating && (
          <View className="mb-4 p-3 border border-gray-300 self-start max-w-[80%]">
            <Text className="mb-1">Assistant</Text>
            <View className="flex-row items-center">
              <ActivityIndicator size="small" className="mr-2" />
              <Text>Thinking...</Text>
            </View>
          </View>
        )}
      </View>

      <View className="border-t border-gray-300 p-4">
        <View className="flex-row items-end">
          <TextInput
            className="flex-1 border border-gray-300 p-3 mr-2"
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your message..."
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage(inputText)}
            editable={!isGenerating}
          />
          <TouchableOpacity
            className={`border p-3 ${
              inputText.trim() && !isGenerating
                ? 'border-gray-600'
                : 'border-gray-300'
            }`}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isGenerating}
          >
            <Text className="text-center">Send</Text>
          </TouchableOpacity>
        </View>
      </View>

      {messages.length === 0 && (
        <View className="flex-1 justify-center items-center">
          <Text className="text-lg font-semibold mb-4">Try the following</Text>
          {EXAMPLE_MESSAGES.map((message, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => sendMessage(message)}
              className="mb-3 p-3 border border-gray-300"
              disabled={isGenerating}
            >
              <Text>{message}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  )
}
