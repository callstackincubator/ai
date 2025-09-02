import './global.css'

import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StatusBar } from 'expo-status-bar'
import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import LLMScreen from './screens/LLMScreen'
import PlaygroundScreen from './screens/PlaygroundScreen'
import SpeechScreen from './screens/SpeechScreen'
import TranscribeScreen from './screens/TranscribeScreen'

const Tab = createNativeBottomTabNavigator()

const RootStack = createNativeStackNavigator()
const LLMStack = createNativeStackNavigator()
const PlaygroundStack = createNativeStackNavigator()
const TranscribeStack = createNativeStackNavigator()
const SpeechStack = createNativeStackNavigator()

function LLMStackScreen() {
  return (
    <LLMStack.Navigator>
      <LLMStack.Screen
        name="LLMScreen"
        component={LLMScreen}
        options={{
          title: 'react-native-ai',
        }}
      />
    </LLMStack.Navigator>
  )
}

function PlaygroundStackScreen() {
  return (
    <PlaygroundStack.Navigator>
      <PlaygroundStack.Screen
        name="PlaygroundScreen"
        component={PlaygroundScreen}
        options={{
          title: 'Playground',
        }}
      />
    </PlaygroundStack.Navigator>
  )
}

function TranscribeStackScreen() {
  return (
    <TranscribeStack.Navigator>
      <TranscribeStack.Screen
        name="TranscribeScreen"
        component={TranscribeScreen}
        options={{
          title: 'Speech to Text',
        }}
      />
    </TranscribeStack.Navigator>
  )
}

function SpeechStackScreen() {
  return (
    <SpeechStack.Navigator>
      <SpeechStack.Screen
        name="SpeechScreen"
        component={SpeechScreen}
        options={{
          title: 'Text to Speech',
        }}
      />
    </SpeechStack.Navigator>
  )
}

function Tabs() {
  return (
    <Tab.Navigator sidebarAdaptable>
      <Tab.Screen
        name="LLM"
        component={LLMStackScreen}
        options={{
          tabBarIcon: () => ({ sfSymbol: 'brain.head.profile' }),
        }}
      />
      <Tab.Screen
        name="Playground"
        component={PlaygroundStackScreen}
        options={{
          tabBarIcon: () => ({ sfSymbol: 'play.circle' }),
        }}
      />
      <Tab.Screen
        name="Transcribe"
        component={TranscribeStackScreen}
        options={{
          tabBarIcon: () => ({ sfSymbol: 'text.quote' }),
        }}
      />
      <Tab.Screen
        name="Speech"
        component={SpeechStackScreen}
        options={{
          tabBarIcon: () => ({ sfSymbol: 'speaker.wave.3' }),
        }}
      />
    </Tab.Navigator>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootStack.Navigator>
          <RootStack.Screen
            name="Home"
            component={Tabs}
            options={{ headerShown: false }}
          />
        </RootStack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
