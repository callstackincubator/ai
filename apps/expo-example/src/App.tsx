import {
  createDrawerNavigator,
  DrawerContentComponentProps,
  DrawerContentScrollView,
} from '@react-navigation/drawer'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { SymbolView } from 'expo-symbols'
import { Provider as JotaiProvider } from 'jotai'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AdaptiveGlass } from './components/AdaptiveGlass'
import ChatScreen from './screens/apple/ChatScreen'
import { useChatStore } from './store/chatStore'
import { colors } from './theme/colors'

function formatChatDate(dateStr: string) {
  const date = new Date(dateStr)
  const diff = Math.round(
    (new Date().setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0)) / 86400000
  )
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CustomDrawerContent({ navigation }: DrawerContentComponentProps) {
  const { chats, currentChatId, selectChat, deleteChat } = useChatStore()

  const groupedChats = chats.reduce(
    (groups, chat) => {
      const key = formatChatDate(chat.createdAt)
      if (!groups[key]) groups[key] = []
      groups[key].push(chat)
      return groups
    },
    {} as Record<string, typeof chats>
  )

  return (
    <DrawerContentScrollView style={styles.drawerScroll}>
      <View style={styles.drawerHeader}>
        <View style={styles.drawerHeaderRow}>
          <Text style={styles.drawerTitle}>Chats</Text>
          <AdaptiveGlass isInteractive style={styles.newChatButton}>
            <Pressable
              onPress={() => {
                selectChat(null)
                navigation.closeDrawer()
              }}
              style={styles.newChatButtonPressable}
            >
              <SymbolView
                name="plus"
                size={18}
                tintColor={colors.label}
                resizeMode="scaleAspectFit"
              />
            </Pressable>
          </AdaptiveGlass>
        </View>
      </View>
      {chats.length === 0 ? (
        <View style={styles.emptyState}>
          <AdaptiveGlass style={styles.emptyStateIcon}>
            <View style={styles.emptyStateIconInner}>
              <SymbolView
                name="bubble.left"
                size={22}
                tintColor={colors.secondaryLabel}
                resizeMode="scaleAspectFit"
              />
            </View>
          </AdaptiveGlass>
          <Text style={styles.emptyStateText}>No conversations yet</Text>
          <Pressable
            onPress={() => {
              selectChat(null)
              navigation.closeDrawer()
            }}
            style={styles.startChatButton}
          >
            <Text style={styles.startChatButtonText}>Start a new chat</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.chatList}>
          {Object.entries(groupedChats).map(([key, group]) => (
            <View key={key} style={styles.chatGroup}>
              <Text style={styles.chatGroupLabel}>{key}</Text>
              {group.map((chat) => (
                <Pressable
                  key={chat.id}
                  onPress={() => {
                    selectChat(chat.id)
                    navigation.closeDrawer()
                  }}
                  style={[
                    styles.chatItem,
                    currentChatId === chat.id && styles.chatItemSelected,
                  ]}
                >
                  <SymbolView
                    name="bubble.left"
                    size={18}
                    tintColor={colors.tertiaryLabel}
                    resizeMode="scaleAspectFit"
                  />
                  <Text style={styles.chatItemTitle} numberOfLines={1}>
                    {chat.title}
                  </Text>
                  <Pressable onPress={() => deleteChat(chat.id)} hitSlop={8}>
                    <SymbolView
                      name="trash"
                      size={16}
                      tintColor={colors.systemRed}
                      resizeMode="scaleAspectFit"
                    />
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
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <JotaiProvider>
            <NavigationContainer>
              <Drawer.Navigator
                drawerContent={(props) => <CustomDrawerContent {...props} />}
                screenOptions={{
                  headerShown: false,
                  drawerStyle: styles.drawer,
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  drawer: {
    width: 280,
    backgroundColor: colors.systemBackground as any,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator as any,
  },
  drawerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.label as any,
  },
  newChatButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  newChatButtonPressable: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  emptyStateIcon: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  emptyStateIconInner: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.secondaryLabel as any,
  },
  startChatButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.separator as any,
  },
  startChatButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.label as any,
  },
  chatList: {
    paddingVertical: 12,
  },
  chatGroup: {
    marginBottom: 8,
  },
  chatGroupLabel: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.secondaryLabel as any,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  chatItemSelected: {
    backgroundColor: colors.secondarySystemBackground as any,
  },
  chatItemTitle: {
    flex: 1,
    fontSize: 15,
    color: colors.label as any,
  },
})
