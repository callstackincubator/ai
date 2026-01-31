import './global.css'

import {
  createDrawerNavigator,
  DrawerContentComponentProps,
  DrawerContentScrollView,
} from '@react-navigation/drawer'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { Provider as JotaiProvider } from 'jotai'
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import MaterialIcons from '@react-native-vector-icons/material-icons'

import ChatScreen from './screens/apple/ChatScreen'
import { useChatStore } from './store/chatStore'

function formatChatDate(date: Date) {
  const now = new Date()
  const diffInDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (diffInDays === 0) return 'Today'
  if (diffInDays === 1) return 'Yesterday'
  if (diffInDays < 7) return `${diffInDays} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CustomDrawerContent({ navigation }: DrawerContentComponentProps) {
  const { chats, currentChatId, createNewChat, selectChat, deleteChat } =
    useChatStore()

  const groupedChats = React.useMemo(() => {
    return chats.reduce(
      (groups, chat) => {
        const key = formatChatDate(chat.createdAt)
        if (!groups[key]) groups[key] = []
        groups[key].push(chat)
        return groups
      },
      {} as Record<string, typeof chats>
    )
  }, [chats])

  return (
    <DrawerContentScrollView>
      <View className="border-b border-slate-200 px-4 py-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-semibold text-slate-900">Chats</Text>
          <Pressable
            onPress={() => {
              createNewChat()
              navigation.closeDrawer()
            }}
            className="h-8 w-8 items-center justify-center rounded-full bg-slate-100"
          >
            <MaterialIcons name="add" size={18} color="#475569" />
          </Pressable>
        </View>
      </View>
      {chats.length === 0 ? (
        <View className="items-center justify-center px-6 py-10">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <MaterialIcons
              name="chat-bubble-outline"
              size={22}
              color="#64748B"
            />
          </View>
          <Text className="mt-3 text-sm text-slate-500">
            No conversations yet
          </Text>
          <Pressable
            onPress={() => {
              createNewChat()
              navigation.closeDrawer()
            }}
            className="mt-4 rounded-full border border-slate-200 px-4 py-2"
          >
            <Text className="text-sm font-semibold text-slate-700">
              Start a new chat
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="py-3">
          {Object.entries(groupedChats).map(([key, group]) => (
            <View key={key} className="mb-2">
              <Text className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {key}
              </Text>
              {group.map((chat) => (
                <Pressable
                  key={chat.id}
                  onPress={() => {
                    selectChat(chat.id)
                    navigation.closeDrawer()
                  }}
                  className={`mx-3 flex-row items-center gap-3 rounded-2xl px-3 py-3 ${
                    currentChatId === chat.id ? 'bg-slate-100' : 'bg-white'
                  }`}
                >
                  <MaterialIcons
                    name="chat-bubble-outline"
                    size={18}
                    color="#94A3B8"
                  />
                  <Text className="flex-1 text-sm text-slate-700">
                    {chat.title}
                  </Text>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation()
                      deleteChat(chat.id)
                    }}
                  >
                    <MaterialIcons name="delete" size={18} color="#EF4444" />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}
    </DrawerContentScrollView>
  )
}

const Drawer = createDrawerNavigator()

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <JotaiProvider>
            <NavigationContainer>
              <Drawer.Navigator
                drawerContent={(props) => <CustomDrawerContent {...props} />}
                screenOptions={{
                  headerShown: false,
                  drawerStyle: {
                    width: 280,
                  },
                }}
              >
                <Drawer.Screen name="Chat" component={ChatScreen} />
              </Drawer.Navigator>
            </NavigationContainer>
            <StatusBar style="auto" />
          </JotaiProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}
