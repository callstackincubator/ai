import './global.css'

import {
  createNativeBottomTabNavigator,
  NativeBottomTabNavigationOptions,
} from '@bottom-tabs/react-navigation'
import Icon from '@react-native-vector-icons/material-icons'
import { NavigationContainer } from '@react-navigation/native'
import {
  createNativeStackNavigator,
  NativeStackNavigatorProps,
} from '@react-navigation/native-stack'
import { StatusBar } from 'expo-status-bar'
import React from 'react'
import { Platform } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import AppleLLMScreen from './screens/apple/AppleLLMScreen'
import PlaygroundScreen from './screens/apple/PlaygroundScreen'
import SpeechScreen from './screens/apple/SpeechScreen'
import TranscribeScreen from './screens/apple/TranscribeScreen'
import LlamaRNScreen from './screens/LlamaRNScreen'
import MLCScreen from './screens/MLCScreen'

const Tab = createNativeBottomTabNavigator()

const RootStack = createNativeStackNavigator()

type ScreenProto = {
  routeName: string
  screenOptions?: NativeStackNavigatorProps['screenOptions']
  tabScreenOptions: NativeBottomTabNavigationOptions
  Component: null | (() => React.JSX.Element)
}

const screens = (
  [
    {
      routeName: 'AppleLLM',
      screenOptions: { title: 'AppleLLM' },
      tabScreenOptions: {
        tabBarIcon: () => ({
          sfSymbol: 'brain.head.profile',
        }),
      },
      Component: AppleLLMScreen,
    },
    {
      routeName: 'Llama',
      screenOptions: { title: 'Llama.rn' },
      tabScreenOptions: {
        tabBarIcon: () =>
          Platform.OS === 'ios'
            ? { sfSymbol: 'sparkles' }
            : Icon.getImageSourceSync('auto-fix-high', 24),
      },
      Component: LlamaRNScreen,
    },
    {
      routeName: 'MLC',
      screenOptions: { title: 'MLC Engine' },
      tabScreenOptions: {
        tabBarIcon: () =>
          Platform.OS === 'ios'
            ? { sfSymbol: 'cpu' }
            : Icon.getImageSourceSync('memory', 24),
      },
      Component: MLCScreen,
    },
    {
      routeName: 'Playground',
      screenOptions: { title: 'Playground' },
      tabScreenOptions: {
        tabBarIcon: () => ({ sfSymbol: 'play.circle' }),
      },
      Component: PlaygroundScreen,
    },
    {
      routeName: 'Transcribe',
      screenOptions: {
        title: 'Speech to Text',
      },
      tabScreenOptions: {
        tabBarIcon: () => ({ sfSymbol: 'text.quote' }),
      },
      Component: TranscribeScreen,
    },
    {
      routeName: 'Speech',
      screenOptions: { title: 'Text to Speech' },
      tabScreenOptions: {
        tabBarIcon: () => ({ sfSymbol: 'speaker.wave.3' }),
      },
      Component: SpeechScreen,
    },
  ] as ScreenProto[]
)
  // filter only components available on the current platform; non-available components have platform-specific entrypoints exporting null
  .filter(
    (
      screen
    ): screen is ScreenProto & {
      Component: NonNullable<ScreenProto['Component']>
    } => screen.Component !== null
  )
  // initialize stack navigators
  .map((screen) => ({
    ...screen,
    StackNavigator: createNativeStackNavigator(),
  }))
  // wrap each screen in its own stack navigator
  .map(({ StackNavigator, Component, screenOptions, ...screen }) => ({
    ...screen,
    Component: () => (
      <StackNavigator.Navigator>
        <StackNavigator.Screen
          name="MLCScreen"
          options={screenOptions}
          component={Component}
        />
      </StackNavigator.Navigator>
    ),
  }))

function Tabs() {
  return (
    <Tab.Navigator sidebarAdaptable>
      {screens.map(({ routeName: name, Component, tabScreenOptions }) => (
        <Tab.Screen
          key={name}
          name={name}
          options={tabScreenOptions}
          component={Component}
        />
      ))}
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
