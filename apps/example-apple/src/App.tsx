import './global.css'

import { Ionicons } from '@react-native-vector-icons/ionicons'
import { createDrawerNavigator } from '@react-navigation/drawer'
import {
  NavigationContainer,
  NavigatorScreenParams,
} from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StatusBar } from 'expo-status-bar'
import { Provider as JotaiProvider } from 'jotai'
import React from 'react'
import { Pressable } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import ChatDrawer from './components/ChatDrawer'
import LLMScreen from './screens/LLMScreen'

export type ChatStackParamList = {
  Chat: { conversationId?: string }
}

export type DrawerParamList = {
  ChatStack: NavigatorScreenParams<ChatStackParamList>
}

const Drawer = createDrawerNavigator()
const Stack = createNativeStackNavigator()

function ChatStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Chat"
        component={LLMScreen}
        options={({ navigation }) => ({
          headerLeft: () => {
            return (
              <Pressable
                onPress={() =>
                  // @ts-ignore
                  navigation.toggleDrawer()
                }
              >
                <Ionicons name="menu" size={24} color="black" />
              </Pressable>
            )
          },
        })}
      />
    </Stack.Navigator>
  )
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <JotaiProvider>
        <KeyboardProvider>
          <SafeAreaProvider>
            <NavigationContainer>
              <Drawer.Navigator
                drawerContent={(props) => <ChatDrawer {...props} />}
              >
                <Drawer.Screen
                  name="ChatStack"
                  component={ChatStack}
                  options={{ headerShown: false }}
                />
              </Drawer.Navigator>
              <StatusBar style="auto" />
            </NavigationContainer>
          </SafeAreaProvider>
        </KeyboardProvider>
      </JotaiProvider>
    </GestureHandlerRootView>
  )
}
