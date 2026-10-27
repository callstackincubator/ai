import { apple } from '@react-native-ai/apple'
import { streamText } from 'ai'
import * as Haptics from 'expo-haptics'
import { Stack } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { SymbolView } from 'expo-symbols'
import React, { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'

import { Glass } from '../../../src/components/Glass'
import { SimulatorNotice } from '../../../src/components/SimulatorNotice'
import { useModels } from '../../../src/store/models'
import { accent, onAccent } from '../../../src/theme/brand'
import { colors } from '../../../src/theme/colors'
import { speak } from '../../../src/voice/speak'
import { useLiveTranscription } from '../../../src/voice/useLiveTranscription'

const SYSTEM_PROMPT =
  "You are a voice assistant on the user's iPhone. Answer in one to three short spoken sentences. Never use Markdown, lists or emoji."

const transcriptionModel = apple.transcriptionModel()

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

const hints: Record<Phase, string> = {
  idle: 'Tap to talk',
  listening: 'Listening… tap when you are done',
  thinking: 'Thinking…',
  speaking: 'Tap to stop',
}

export default function VoiceScreen() {
  const { selectedModel } = useModels()
  const headerHeight = useHeaderHeight()
  const { transcript, level, start, stop } =
    useLiveTranscription(transcriptionModel)
  const [phase, setPhase] = useState<Phase>('idle')
  const [reply, setReply] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)

  // A reply still generating or speaking stops with the screen
  useEffect(() => () => abortControllerRef.current?.abort(), [])

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(1 + level.value * 0.35) }],
  }))

  const answer = async (question: string) => {
    if (!selectedModel) return
    const controller = new AbortController()
    abortControllerRef.current = controller
    setPhase('thinking')
    try {
      const result = streamText({
        model: selectedModel.model,
        system: SYSTEM_PROMPT,
        prompt: question,
        // Spoken answers should come quickly, without thinking first
        reasoning: selectedModel.capabilities.includes('reasoning')
          ? 'none'
          : undefined,
        abortSignal: controller.signal,
      })
      let text = ''
      for await (const chunk of result.textStream) {
        text += chunk
        setReply(text)
      }
      setPhase('speaking')
      await speak(text, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) {
        Alert.alert(
          'Something went wrong',
          error instanceof Error ? error.message : undefined
        )
      }
    } finally {
      setPhase('idle')
    }
  }

  const handlePress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (phase === 'idle') {
      setReply('')
      try {
        const started = await start()
        if (!started) {
          Alert.alert(
            'Microphone access needed',
            'Allow microphone access in Settings to talk.'
          )
          return
        }
        setPhase('listening')
      } catch (error) {
        Alert.alert(
          'Could not start recording',
          error instanceof Error ? error.message : undefined
        )
      }
    } else if (phase === 'listening') {
      // Leaves listening right away, so a second tap can't stop twice
      setPhase('thinking')
      try {
        const question = await stop()
        if (question) {
          answer(question)
        } else {
          setPhase('idle')
        }
      } catch (error) {
        setPhase('idle')
        Alert.alert(
          'Could not hear that',
          error instanceof Error ? error.message : undefined
        )
      }
    } else {
      abortControllerRef.current?.abort()
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Voice', headerTransparent: true }} />
      <View style={[styles.notice, { paddingTop: headerHeight + 8 }]}>
        <SimulatorNotice>
          Simulator preview: Voice hears a scripted question. On iPhone it
          listens to you.
        </SimulatorNotice>
      </View>
      <View style={styles.conversation}>
        {transcript ? (
          <Animated.Text entering={FadeIn} style={styles.question}>
            {transcript}
          </Animated.Text>
        ) : (
          <Text style={styles.placeholder}>
            Ask anything, out loud.{'\n'}Speech never leaves this iPhone.
          </Text>
        )}
        {reply ? (
          <Animated.Text entering={FadeIn} style={styles.reply}>
            {reply}
          </Animated.Text>
        ) : null}
      </View>
      <View style={styles.controls}>
        <Animated.View style={orbStyle}>
          <Glass
            isInteractive
            tintColor={phase === 'listening' ? '#FF3B30' : accent}
            style={styles.orb}
          >
            <Pressable
              accessibilityLabel={hints[phase]}
              disabled={!selectedModel}
              onPress={handlePress}
              style={styles.orbPressable}
            >
              <SymbolView
                name={
                  phase === 'listening'
                    ? 'waveform'
                    : phase === 'idle'
                      ? 'mic.fill'
                      : 'stop.fill'
                }
                size={40}
                tintColor={phase === 'listening' ? '#FFFFFF' : onAccent}
                animationSpec={
                  phase === 'listening'
                    ? { effect: { type: 'pulse' }, repeating: true }
                    : undefined
                }
              />
            </Pressable>
          </Glass>
        </Animated.View>
        <Animated.Text
          key={phase}
          entering={FadeIn}
          exiting={FadeOut}
          style={styles.hint}
        >
          {selectedModel
            ? phase === 'idle'
              ? `${hints.idle} · ${selectedModel.label} answers`
              : hints[phase]
            : 'Set up a chat model in Settings'}
        </Animated.Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.systemBackground,
  },
  notice: {
    paddingHorizontal: 16,
  },
  conversation: {
    flex: 1,
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 28,
  },
  placeholder: {
    fontSize: 22,
    lineHeight: 30,
    textAlign: 'center',
    color: colors.tertiaryLabel,
  },
  question: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '500',
    color: colors.secondaryLabel,
  },
  reply: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '600',
    color: colors.label,
  },
  controls: {
    alignItems: 'center',
    gap: 20,
    paddingBottom: 140,
  },
  orb: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  orbPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 15,
    color: colors.secondaryLabel,
  },
})
