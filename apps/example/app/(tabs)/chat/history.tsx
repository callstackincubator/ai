import { router, Stack } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import React, { useState } from 'react'
import {
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { type Chat, useChats } from '../../../src/store/chats'
import { colors } from '../../../src/theme/colors'

function formatChatDate(dateStr: string) {
  const date = new Date(dateStr)
  const diff = Math.round(
    (new Date().setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0)) / 86400000
  )
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return 'Previous 7 Days'
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function History() {
  const { chats, currentChat, selectChat, deleteChat } = useChats()
  const [query, setQuery] = useState('')

  const filtered = chats.filter((chat) =>
    chat.title.toLowerCase().includes(query.trim().toLowerCase())
  )
  const sections: { title: string; data: Chat[] }[] = []
  for (const chat of filtered) {
    const title = formatChatDate(chat.createdAt)
    const section = sections.find((item) => item.title === title)
    if (section) section.data.push(chat)
    else sections.push({ title, data: [chat] })
  }

  return (
    <>
      <Stack.SearchBar
        placeholder="Search chats"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
      />
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        style={styles.list}
        sections={sections}
        keyExtractor={(chat) => chat.id}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <SymbolView
              name="bubble.left.and.bubble.right"
              size={36}
              tintColor={colors.tertiaryLabel}
            />
            <Text style={styles.emptyText}>
              {query ? 'No matching chats' : 'Your chats will show up here'}
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item: chat }) => (
          <Pressable
            onPress={() => {
              selectChat(chat.id)
              router.back()
            }}
            onLongPress={() =>
              Alert.alert('Delete this chat?', chat.title, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => deleteChat(chat.id),
                },
              ])
            }
            style={({ pressed }) => [
              styles.row,
              (pressed || chat.id === currentChat?.id) && styles.rowSelected,
            ]}
          >
            <Text style={styles.rowTitle} numberOfLines={1}>
              {chat.title}
            </Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {(chat.messages[chat.messages.length - 1]?.content ?? '')
                // Plain text preview of the Markdown reply
                .replace(/[*_#`>]|^\s*[-+]\s/gm, '')
                .trim()}
            </Text>
          </Pressable>
        )}
      />
    </>
  )
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.systemBackground,
  },
  sectionTitle: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colors.secondaryLabel,
  },
  row: {
    marginHorizontal: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: 'continuous',
    gap: 2,
  },
  rowSelected: {
    backgroundColor: colors.tertiarySystemFill,
  },
  rowTitle: {
    fontSize: 17,
    color: colors.label,
  },
  rowSubtitle: {
    fontSize: 14,
    color: colors.secondaryLabel,
  },
  empty: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 120,
  },
  emptyText: {
    fontSize: 16,
    color: colors.secondaryLabel,
  },
})
