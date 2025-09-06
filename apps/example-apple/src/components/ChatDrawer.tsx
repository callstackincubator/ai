import { Ionicons } from '@react-native-vector-icons/ionicons'
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
} from '@react-navigation/drawer'
import { useAtomValue, useSetAtom } from 'jotai'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

import { conversationsAtom } from '../store/chat'

export default function ChatDrawer({
  navigation,
}: DrawerContentComponentProps) {
  const conversations = useAtomValue(conversationsAtom)
  const conversationList = Object.values(conversations).sort(
    (a, b) => b.updatedAt - a.updatedAt
  )

  const setConversations = useSetAtom(conversationsAtom)

  const handleNewChat = () => {
    navigation.navigate('ChatStack', {
      screen: 'Chat',
    })
  }

  const handleSelectChat = (conversationId: string) => {
    navigation.navigate('ChatStack', {
      screen: 'Chat',
      params: { conversationId },
    })
  }

  const handleRemoveChat = (conversationId: string) => {
    setConversations((prev) => {
      const newConversations = { ...prev }
      delete newConversations[conversationId]
      return newConversations
    })
  }

  return (
    <DrawerContentScrollView className="flex-1 bg-gray-50">
      <View className="p-4">
        <TouchableOpacity
          className="bg-blue-500 rounded-lg py-3 mb-4 flex-row items-center justify-center"
          onPress={handleNewChat}
        >
          <Ionicons name="add" size={20} color="white" />
          <Text className="text-white font-semibold ml-2">New Chat</Text>
        </TouchableOpacity>

        <Text className="text-gray-500 text-sm font-medium mb-2">
          Recent Chats
        </Text>

        {conversationList.length === 0 ? (
          <Text className="text-gray-400 text-center py-4">
            No conversations yet
          </Text>
        ) : (
          conversationList.map((conversation) => (
            <TouchableOpacity
              key={conversation.id}
              className="bg-white rounded-lg p-3 mb-2 border border-gray-200"
              onPress={() => handleSelectChat(conversation.id)}
              onLongPress={() => handleRemoveChat(conversation.id)}
            >
              <Text className="font-medium text-gray-900" numberOfLines={1}>
                {conversation.title}
              </Text>
              <Text className="text-xs text-gray-500 mt-1">
                {new Date(conversation.updatedAt).toLocaleDateString()} -{' '}
                {conversation.messages.length} messages
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </DrawerContentScrollView>
  )
}
