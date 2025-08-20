import { createAppleProvider } from '@react-native-ai/apple'
import { generateText, tool } from 'ai'
import * as Battery from 'expo-battery'
import * as Calendar from 'expo-calendar'
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
import { z } from 'zod'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const checkBattery = tool({
  description: 'Check device battery level and charging status',
  inputSchema: z.object({}),
  execute: async () => {
    const level = await Battery.getBatteryLevelAsync()
    const state = await Battery.getBatteryStateAsync()

    return {
      level: Math.round(level * 100),
      isCharging: state === Battery.BatteryState.CHARGING,
    }
  },
})

const createCalendarEvent = tool({
  description: 'Create a new calendar event',
  inputSchema: z.object({
    title: z.string().describe('Event title'),
    date: z.string().describe('Event date (YYYY-MM-DD)'),
    time: z.string().optional().describe('Event time (HH:MM)'),
    duration: z.number().optional().describe('Duration in minutes'),
  }),
  execute: async ({ title, date, time, duration = 60 }) => {
    await Calendar.requestCalendarPermissionsAsync()

    const calendars = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes.EVENT
    )

    const eventDate = new Date(date)
    if (time) {
      const [hours, minutes] = time.split(':').map(Number)
      eventDate.setHours(hours, minutes)
    }

    await Calendar.createEventAsync(calendars[0].id, {
      title,
      startDate: eventDate,
      endDate: new Date(eventDate.getTime() + duration * 60 * 1000),
    })

    return { message: `Created "${title}"` }
  },
})

const checkCalendarEvents = tool({
  description: 'Check upcoming calendar events',
  inputSchema: z.object({
    days: z.number().optional().describe('Number of days to look ahead'),
  }),
  execute: async ({ days = 7 }) => {
    await Calendar.requestCalendarPermissionsAsync()

    const calendars = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes.EVENT
    )

    const startDate = new Date()
    const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000)

    const events = await Calendar.getEventsAsync(
      calendars.map((cal) => cal.id),
      startDate,
      endDate
    )

    return events.map((event) => ({
      title: event.title,
      date: event.startDate,
    }))
  },
})

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

  const sendMessage = async () => {
    if (!inputText.trim() || isGenerating) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputText('')
    setIsGenerating(true)

    try {
      const result = await generateText({
        model: apple(),
        messages: [...messages, { role: 'user', content: userMessage.content }],
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
    <View className="flex-1">
      <View className="p-4 border-b border-gray-300">
        <Text className="text-center">LLM Chat</Text>
      </View>

      <ScrollView className="flex-1 p-4">
        {messages.length === 0 ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-center">
              Start a conversation with Apple Intelligence
            </Text>
          </View>
        ) : (
          messages.map((message) => (
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
          ))
        )}
        {isGenerating && (
          <View className="mb-4 p-3 border border-gray-300 self-start max-w-[80%]">
            <Text className="mb-1">Assistant</Text>
            <View className="flex-row items-center">
              <ActivityIndicator size="small" className="mr-2" />
              <Text>Thinking...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View className="border-t border-gray-300 p-4">
        <View className="flex-row items-end">
          <TextInput
            className="flex-1 border border-gray-300 p-3 mr-2"
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your message..."
            multiline
            maxLength={500}
            onSubmitEditing={sendMessage}
            editable={!isGenerating}
          />
          <TouchableOpacity
            className={`border p-3 ${
              inputText.trim() && !isGenerating
                ? 'border-gray-600'
                : 'border-gray-300'
            }`}
            onPress={sendMessage}
            disabled={!inputText.trim() || isGenerating}
          >
            <Text className="text-center">Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}
