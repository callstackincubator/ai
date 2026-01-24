import './global.css'

import {
  createNativeBottomTabNavigator,
  NativeBottomTabNavigationOptions,
} from '@bottom-tabs/react-navigation'
import { NavigationContainer } from '@react-navigation/native'
import {
  createNativeStackNavigator,
  NativeStackNavigatorProps,
} from '@react-navigation/native-stack'
import { StatusBar } from 'expo-status-bar'
import React from 'react'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import ChatScreen from './screens/apple/ChatScreen'
import PlaygroundScreen from './screens/apple/PlaygroundScreen'
import SpeechScreen from './screens/apple/SpeechScreen'
import TranscribeScreen from './screens/apple/TranscribeScreen'

const Tab = createNativeBottomTabNavigator()

const RootStack = createNativeStackNavigator()

type ScreenProto = {
  routeName: string
  screenOptions?: NativeStackNavigatorProps['screenOptions']
  tabScreenOptions: NativeBottomTabNavigationOptions
  Component: () => React.JSX.Element
}

const screens = (
  [
    {
      routeName: 'Chat',
      screenOptions: { title: 'Chat' },
      tabScreenOptions: {
        tabBarIcon: () => ({
          sfSymbol: 'brain.head.profile',
        }),
      },
      Component: ChatScreen,
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
