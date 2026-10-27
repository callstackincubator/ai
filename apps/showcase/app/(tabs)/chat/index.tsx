import {
  KeyboardAwareLegendList,
  useKeyboardChatComposerInset,
  useKeyboardScrollToEnd,
} from '@legendapp/list/keyboard'
import type { LegendListRef } from '@legendapp/list/react-native'
import { router, Stack } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { SymbolView } from 'expo-symbols'
import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View, type ViewInstance } from 'react-native'
import { KeyboardStickyView } from 'react-native-keyboard-controller'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Composer } from '../../../src/chat/Composer'
import { type ChatItem, MessageRow } from '../../../src/chat/MessageRow'
import { useChatGeneration } from '../../../src/chat/useChatGeneration'
import { useChats, useStreamingReply } from '../../../src/store/chats'
import { useModels } from '../../../src/store/models'
import { colors } from '../../../src/theme/colors'
import type { ImageAttachment } from '../../../src/utils/imageAttachments'

function EmptyState({ modelLabel }: { modelLabel?: string }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.empty}>
      <SymbolView
        name="apple.intelligence"
        size={44}
        tintColor={colors.systemIndigo}
      />
      <Text style={styles.emptyTitle}>What can I help with?</Text>
      <Text style={styles.emptySubtitle}>
        {modelLabel
          ? `${modelLabel} runs on this iPhone. Nothing leaves the device.`
          : 'Download a model in Settings to start chatting.'}
      </Text>
    </Animated.View>
  )
}

export default function ChatScreen() {
  const { currentChat, selectChat } = useChats()
  const streamingReply = useStreamingReply()
  const { readyModels, selectedModel, selectModel } = useModels()
  const { isGenerating, send, regenerate, stop } = useChatGeneration()

  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const listRef = useRef<LegendListRef>(null)
  const composerRef = useRef<ViewInstance>(null)
  const { contentInsetEndAdjustment, onComposerLayout } =
    useKeyboardChatComposerInset(listRef, composerRef)
  const { scrollMessageToEnd } = useKeyboardScrollToEnd({ listRef })

  // The message just sent: it slides in and is held at the top of the screen
  // while the reply streams in below it. Other chats never match it
  const [sentMessageId, setSentMessageId] = useState<string | null>(null)

  useEffect(() => {
    selectedModel?.prepare().catch(() => {})
  }, [selectedModel])

  const messages = currentChat?.messages ?? []
  const items: ChatItem[] = messages.map((message) => ({
    kind: 'message',
    message,
    isNew: message.id === sentMessageId,
  }))
  if (streamingReply && streamingReply.chatId === currentChat?.id) {
    items.push({
      kind: 'streaming',
      id: streamingReply.id,
      content: streamingReply.content,
    })
  }
  const anchorIndex = items.findIndex(
    (item) => item.kind === 'message' && item.message.id === sentMessageId
  )

  const handleSend = (content: string, attachments: ImageAttachment[]) => {
    const isFirstMessage = messages.length === 0
    const messageId = send(content, attachments)
    if (!messageId) return
    setSentMessageId(messageId)
    // Read back from the store on the next render
    setTimeout(() => {
      scrollMessageToEnd({ animated: !isFirstMessage, closeKeyboard: false })
    })
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: currentChat?.title ?? '',
          headerTransparent: true,
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon="clock.arrow.circlepath"
          accessibilityLabel="History"
          onPress={() => router.push('/chat/history')}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="cpu" title="Model">
          {readyModels.map((adapter) => (
            <Stack.Toolbar.MenuAction
              key={adapter.modelId}
              isOn={adapter.modelId === selectedModel?.modelId}
              onPress={() => selectModel(adapter.modelId)}
            >
              {adapter.label}
            </Stack.Toolbar.MenuAction>
          ))}
          <Stack.Toolbar.MenuAction
            icon="gearshape"
            onPress={() => router.push('/settings')}
          >
            Settings
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Button
          icon="square.and.pencil"
          accessibilityLabel="New chat"
          onPress={() => selectChat(null)}
        />
      </Stack.Toolbar>

      {items.length === 0 ? (
        <EmptyState modelLabel={selectedModel?.label} />
      ) : (
        <KeyboardAwareLegendList
          key={currentChat?.id}
          ref={listRef}
          data={items}
          keyExtractor={(item) =>
            item.kind === 'message' ? item.message.id : item.id
          }
          renderItem={({ item }) => (
            <MessageRow item={item} onRegenerate={regenerate} />
          )}
          estimatedItemSize={80}
          initialScrollAtEnd
          maintainScrollAtEnd
          keyboardLiftBehavior="whenAtEnd"
          keyboardOffset={insets.bottom}
          keyboardDismissMode="interactive"
          contentInsetEndAdjustment={contentInsetEndAdjustment}
          anchoredEndSpace={
            anchorIndex >= 0
              ? { anchorIndex, anchorOffset: headerHeight + 8 }
              : undefined
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: headerHeight + 8 },
          ]}
        />
      )}

      <KeyboardStickyView
        offset={{ closed: 0, opened: insets.bottom }}
        style={styles.composerContainer}
      >
        <View
          ref={composerRef}
          onLayout={onComposerLayout}
          style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}
        >
          <Composer
            onSend={handleSend}
            onStop={stop}
            isGenerating={isGenerating}
            imageInputEnabled={selectedModel?.imageInput ?? false}
          />
        </View>
      </KeyboardStickyView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.systemBackground,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
    paddingBottom: 120,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.label,
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: colors.secondaryLabel,
  },
  composerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  composer: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
})
