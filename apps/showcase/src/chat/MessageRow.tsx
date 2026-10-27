import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { type SFSymbol, SymbolView } from 'expo-symbols'
import React, { useEffect } from 'react'
import {
  Image,
  Pressable,
  Share,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native'
import { EnrichedMarkdownText } from 'react-native-enriched-markdown'
import Animated, {
  Easing,
  FadeIn,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import type { Message } from '../store/chats'
import { colors } from '../theme/colors'
import { markdownStyle } from '../theme/markdown'
import { getAttachmentUri } from '../utils/imageAttachments'

export type ChatItem =
  | { kind: 'message'; message: Message; isNew: boolean }
  | { kind: 'streaming'; id: string; content: string }

function UserMessage({ message, isNew }: { message: Message; isNew: boolean }) {
  return (
    <Animated.View
      entering={
        isNew
          ? SlideInDown.easing(Easing.out(Easing.exp)).duration(700)
          : undefined
      }
      style={styles.userContainer}
    >
      {message.attachments?.map((attachment) => (
        <Image
          key={attachment.fileName}
          source={{ uri: getAttachmentUri(attachment) }}
          style={styles.attachment}
        />
      ))}
      {message.content ? (
        <View style={styles.userBubble}>
          <Animated.Text selectable style={styles.userText}>
            {message.content}
          </Animated.Text>
        </View>
      ) : null}
    </Animated.View>
  )
}

function Thinking() {
  const opacity = useSharedValue(0.35)

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true)
  }, [opacity])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View entering={FadeIn.delay(450).duration(300)}>
      <Animated.Text style={[styles.thinking, style]}>Thinking…</Animated.Text>
    </Animated.View>
  )
}

function ActionButton({
  symbol,
  label,
  onPress,
}: {
  symbol: SFSymbol
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        Haptics.selectionAsync()
        onPress()
      }}
      style={styles.action}
    >
      <SymbolView name={symbol} size={16} tintColor={colors.secondaryLabel} />
    </Pressable>
  )
}

function AssistantMessage({
  content,
  isStreaming,
  onRegenerate,
}: {
  content: string
  isStreaming: boolean
  onRegenerate?: () => void
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'

  if (isStreaming && !content) {
    return <Thinking />
  }

  return (
    <View style={styles.assistant}>
      <EnrichedMarkdownText
        markdown={content}
        markdownStyle={markdownStyle(scheme)}
        flavor="github"
        streamingAnimation={isStreaming}
      />
      {!isStreaming && (
        <Animated.View entering={FadeIn} style={styles.actions}>
          <ActionButton
            symbol="doc.on.doc"
            label="Copy"
            onPress={() => Clipboard.setStringAsync(content)}
          />
          <ActionButton
            symbol="square.and.arrow.up"
            label="Share"
            onPress={() => Share.share({ message: content })}
          />
          {onRegenerate && (
            <ActionButton
              symbol="arrow.clockwise"
              label="Regenerate"
              onPress={onRegenerate}
            />
          )}
        </Animated.View>
      )}
    </View>
  )
}

export function MessageRow({
  item,
  onRegenerate,
}: {
  item: ChatItem
  onRegenerate: (messageId: string) => void
}) {
  if (item.kind === 'streaming') {
    return <AssistantMessage content={item.content} isStreaming />
  }
  if (item.message.role === 'user') {
    return <UserMessage message={item.message} isNew={item.isNew} />
  }
  return (
    <AssistantMessage
      content={item.message.content}
      isStreaming={false}
      onRegenerate={() => onRegenerate(item.message.id)}
    />
  )
}

const styles = StyleSheet.create({
  userContainer: {
    alignItems: 'flex-end',
    gap: 6,
    paddingVertical: 8,
    paddingLeft: 48,
  },
  userBubble: {
    borderRadius: 22,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.secondarySystemFill,
  },
  userText: {
    fontSize: 17,
    lineHeight: 23,
    color: colors.label,
  },
  attachment: {
    width: 160,
    height: 160,
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  assistant: {
    paddingVertical: 8,
  },
  thinking: {
    paddingVertical: 12,
    fontSize: 17,
    fontWeight: '500',
    color: colors.secondaryLabel,
  },
  actions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 10,
  },
  action: {
    paddingVertical: 4,
  },
})
