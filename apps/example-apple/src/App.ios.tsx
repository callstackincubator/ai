import './global.css'

import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StatusBar } from 'expo-status-bar'
import React from 'react'
import { Image } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import LlamaRNScreen from './screens/LlamaRNScreen'
import LLMScreen from './screens/LLMScreen'
import MLCScreen from './screens/MLCScreen'
import PlaygroundScreen from './screens/PlaygroundScreen'
import SpeechScreen from './screens/SpeechScreen'
import TranscribeScreen from './screens/TranscribeScreen'

const Tab = createNativeBottomTabNavigator()

const RootStack = createNativeStackNavigator()
const LLMStack = createNativeStackNavigator()
const LlamaStack = createNativeStackNavigator()
const MLCStack = createNativeStackNavigator()
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
          headerTitle: () => (
            <Image
              source={require('../assets/ck.png')}
              style={{ width: 36, height: 36, marginTop: 10 }}
              resizeMode="contain"
            />
          ),
        }}
      />
    </LLMStack.Navigator>
  )
}

function LlamaStackScreen() {
  return (
    <LlamaStack.Navigator>
      <LlamaStack.Screen
        name="LlamaScreen"
        component={LlamaRNScreen}
        options={{
          title: 'Llama.rn',
        }}
      />
    </LlamaStack.Navigator>
  )
}

function MLCStackScreen() {
  return (
    <MLCStack.Navigator>
      <MLCStack.Screen
        name="MLCScreen"
        component={MLCScreen}
        options={{
          title: 'MLC Engine',
        }}
      />
    </MLCStack.Navigator>
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
        name="Llama"
        component={LlamaStackScreen}
        options={{
          tabBarIcon: () => ({ sfSymbol: 'sparkles' }),
        }}
      />
      <Tab.Screen
        name="MLC"
        component={MLCStackScreen}
        options={{
          tabBarIcon: () => ({ sfSymbol: 'cpu' }),
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
    <KeyboardProvider>
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
    </KeyboardProvider>
  )
}
