import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { type SFSymbol, SymbolView } from 'expo-symbols'
import React, { useEffect, useState } from 'react'
import {
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
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

const markdownFlags = { hardSoftBreaks: true }

export type ChatItem =
  | { kind: 'message'; message: Message; isNew: boolean }
  | { kind: 'streaming'; id: string; content: string; reasoning: string }

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

// A model's thinking, collapsed to one line until tapped
function Reasoning({
  text,
  isThinking,
}: {
  text: string
  isThinking: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  // While thinking, the line shows the latest thought
  const preview = (text.trim().split('\n').filter(Boolean).pop() ?? '')
    .replace(/[*_#`>]/g, '')
    .trim()

  return (
    <Pressable
      onPress={() => setExpanded((value) => !value)}
      accessibilityLabel={expanded ? 'Hide reasoning' : 'Show reasoning'}
      style={styles.reasoning}
    >
      <View style={styles.reasoningHeader}>
        <SymbolView name="brain" size={14} tintColor={colors.secondaryLabel} />
        <Text style={styles.reasoningTitle}>
          {isThinking ? 'Thinking' : 'Thought'}
        </Text>
        <Text style={styles.reasoningPreview} numberOfLines={1}>
          {expanded ? '' : preview}
        </Text>
        <SymbolView
          name={expanded ? 'chevron.up' : 'chevron.down'}
          size={12}
          tintColor={colors.tertiaryLabel}
        />
      </View>
      {expanded && <Text style={styles.reasoningText}>{text.trim()}</Text>}
    </Pressable>
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
  reasoning,
  isStreaming,
  onRegenerate,
}: {
  content: string
  reasoning?: string
  isStreaming: boolean
  onRegenerate?: () => void
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'

  if (isStreaming && !content && !reasoning) {
    return <Thinking />
  }

  return (
    <View style={styles.assistant}>
      {reasoning ? (
        <Reasoning text={reasoning} isThinking={isStreaming && !content} />
      ) : null}
      <EnrichedMarkdownText
        markdown={content}
        markdownStyle={markdownStyle(scheme)}
        flavor="github"
        // Models break lines without Markdown's blank lines, as in poems
        md4cFlags={markdownFlags}
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
    return (
      <AssistantMessage
        content={item.content}
        reasoning={item.reasoning}
        isStreaming
      />
    )
  }
  if (item.message.role === 'user') {
    return <UserMessage message={item.message} isNew={item.isNew} />
  }
  return (
    <AssistantMessage
      content={item.message.content}
      reasoning={item.message.reasoning}
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
  reasoning: {
    marginBottom: 8,
    padding: 10,
    gap: 8,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.tertiarySystemFill,
  },
  reasoningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reasoningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondaryLabel,
  },
  reasoningPreview: {
    flex: 1,
    fontSize: 14,
    color: colors.tertiaryLabel,
  },
  reasoningText: {
    fontSize: 14,
    lineHeight: 20,
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
