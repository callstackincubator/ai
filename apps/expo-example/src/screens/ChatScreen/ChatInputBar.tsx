import Ionicons from '@expo/vector-icons/Ionicons'
import { SymbolView } from 'expo-symbols'
import React, { useState } from 'react'
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'

import { AdaptiveGlass } from '../../components/AdaptiveGlass'
import { Button, ContextMenu, Host } from '../../components/expo-ui'
import { RecordButton } from '../../components/RecordButton'
import { colors } from '../../theme/colors'

type ChatInputBarProps = {
  onSend: (message: string) => void
  isGenerating: boolean
}

export function ChatInputBar({ onSend, isGenerating }: ChatInputBarProps) {
  const [input, setInput] = useState('')

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isGenerating) return
    onSend(trimmed)
    setInput('')
  }

  return (
    <AdaptiveGlass style={styles.inputBar}>
      <View style={styles.inputRow}>
        <AdaptiveGlass isInteractive style={styles.plusButton}>
          <Host matchContents>
            <ContextMenu activationMethod="singlePress">
              <ContextMenu.Items>
                <Button
                  systemImage={Platform.select({
                    ios: 'camera',
                    android: 'rounded.ArrowForward',
                  })}
                  onPress={() => console.log('Take Photo')}
                >
                  Take Photo
                </Button>
                <Button
                  systemImage={Platform.select({
                    ios: 'photo.on.rectangle',
                    android: 'rounded.ArrowBack',
                  })}
                  onPress={() => console.log('Photo Library')}
                >
                  Photo Library
                </Button>
              </ContextMenu.Items>
              <ContextMenu.Trigger>
                <Button
                  systemImage={Platform.select({
                    ios: 'plus',
                    android: 'rounded.Add',
                  })}
                  variant="borderless"
                  color={colors.tertiaryLabel as any}
                />
              </ContextMenu.Trigger>
            </ContextMenu>
          </Host>
        </AdaptiveGlass>

        <View style={styles.textInputContainer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message"
            placeholderTextColor={colors.secondaryLabel as any}
            multiline
            style={styles.textInput}
            editable={!isGenerating}
          />
        </View>

        {input.trim() ? (
          <Pressable
            onPress={handleSend}
            disabled={isGenerating}
            style={styles.sendButton}
          >
            <SymbolView
              name="arrow.up"
              size={20}
              tintColor="#fff"
              resizeMode="scaleAspectFit"
              fallback={<Ionicons name="arrow-up" size={20} color="#fff" />}
            />
          </Pressable>
        ) : (
          <RecordButton
            onTranscriptionComplete={(text) =>
              setInput((prev) => (prev ? `${prev} ${text}` : text))
            }
            disabled={isGenerating}
          />
        )}
      </View>
    </AdaptiveGlass>
  )
}

const styles = StyleSheet.create({
  inputBar: {
    padding: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  plusButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: colors.tertiarySystemFill as any,
    paddingHorizontal: 16,
    minHeight: 40,
  },
  textInput: {
    flex: 1,
    fontSize: 17,
    color: colors.label as any,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginBottom: 2,
    backgroundColor: colors.systemBlue as any,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
