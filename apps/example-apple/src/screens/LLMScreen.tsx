import { createAppleProvider } from '@react-native-ai/apple'
import {
  NavigationProp,
  RouteProp,
  useNavigation,
} from '@react-navigation/native'
import { generateObject, ModelMessage, streamText } from 'ai'
import { useAtom } from 'jotai'
import React, { useEffect, useRef, useState } from 'react'
import {
  Keyboard,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { z } from 'zod'

import { ChatStackParamList } from '../App'
import SpeechText from '../components/SpeechText'
import VoiceRecorder from '../components/VoiceRecorder'
import { conversationAtom } from '../store/chat'
import {
  checkCalendarEvents,
  createCalendarEvent,
  getCurrentTime,
} from '../tools'

type LLMScreenRouteProp = RouteProp<ChatStackParamList, 'Chat'>
type LLMScreenNavigationProp = NavigationProp<ChatStackParamList, 'Chat'>

const apple = createAppleProvider({
  availableTools: {
    getCurrentTime,
    createCalendarEvent,
    checkCalendarEvents,
  },
})

const DEFAULT_CHAT_TITLE = 'New Chat'

export default function LLMScreen({ route }: { route: LLMScreenRouteProp }) {
  const navigation = useNavigation<LLMScreenNavigationProp>()

  const [inputText, setInputText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const scrollViewRef = useRef<ScrollView>(null)

  const [activeConversation, setConversation] = useAtom(
    conversationAtom(route.params?.conversationId)
  )

  useEffect(() => {
    const title = activeConversation?.title || DEFAULT_CHAT_TITLE
    navigation.setOptions({
      title,
    })
  }, [activeConversation, navigation])

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        scrollViewRef.current?.scrollToEnd({ animated: true })
      }
    )
    return () => {
      keyboardDidShowListener.remove()
    }
  }, [])

  const sendMessage = async () => {
    if (!inputText.trim() || isGenerating) return

    const userMessage: ModelMessage = {
      role: 'user',
      content: inputText.trim(),
    }

    setInputText('')
    setIsGenerating(true)

    let conversation = activeConversation

    /*
     * Create conversation if it does not exist
     */
    if (!conversation) {
      const id = Date.now().toString()
      conversation = {
        id,
        title: DEFAULT_CHAT_TITLE,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      setConversation(id, conversation)
    }

    /*
     * Update navigation params to point to newly created conversation
     */
    navigation.setParams({ conversationId: conversation.id })

    /*
     * Create initial array of messages for the history
     */
    const messages = [...conversation.messages, userMessage]
    setConversation(conversation.id, {
      messages: [
        ...messages,
        {
          role: 'assistant',
          content: '...',
        },
      ],
    })

    let accumulatedContent = ''

    try {
      /*
       * Request response from the model
       */
      const result = streamText({
        model: apple(),
        messages,
        tools: {
          getCurrentTime,
          createCalendarEvent,
          checkCalendarEvents,
        },
      })

      for await (const chunk of result.textStream) {
        accumulatedContent += chunk
        setConversation(conversation.id, {
          messages: [
            ...conversation.messages,
            userMessage,
            {
              role: 'assistant',
              content: accumulatedContent,
            },
          ],
        })
      }

      /*
       * Once initial request completes, generate title for the chat
       */
      if (conversation.title === DEFAULT_CHAT_TITLE) {
        const response = await generateObject({
          model: apple(),
          messages: [
            ...messages,
            {
              role: 'user',
              content:
                'Given current history, generate brief title for the chat that describes the conversation best.',
            },
          ],
          schema: z.object({
            title: z.string().describe('Brief title for the chat'),
          }),
        })
        setConversation(conversation.id, {
          title: response.object.title,
        })
      }
    } catch (error) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`
      setConversation(conversation.id, {
        messages: [
          ...conversation.messages,
          userMessage,
          {
            role: 'assistant',
            content: errorMessage,
          },
        ],
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior="padding"
      keyboardVerticalOffset={100}
    >
      {activeConversation ? (
        <ScrollView
          ref={scrollViewRef}
          className="flex-1 p-4"
          onContentSizeChange={() => {
            scrollViewRef.current?.scrollToEnd({ animated: true })
          }}
        >
          {activeConversation.messages.map((message, index) => (
            <View
              key={index}
              className={`flex-row mb-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <View
                className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                  message.role === 'user' ? 'bg-blue-500' : 'bg-gray-100'
                }`}
              >
                {message.role === 'user' ? (
                  <Text className="text-white">
                    {message.content as string}
                  </Text>
                ) : (
                  <SpeechText className="text-gray-900">
                    {message.content as string}
                  </SpeechText>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View className="flex-1 justify-center items-center">
          <Text className="text-gray-500">
            Hello! How can I help you today?
          </Text>
        </View>
      )}

      <View className="flex-row items-center p-4 border-t border-gray-200 pb-6">
        <TextInput
          className="flex-1 bg-gray-100 rounded-full px-4 py-2 mr-2"
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#9CA3AF"
          onSubmitEditing={sendMessage}
          editable={!isGenerating}
        />
        <VoiceRecorder
          onTranscription={(text) => {
            setInputText(text)
          }}
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
    </KeyboardAvoidingView>
  )
}
