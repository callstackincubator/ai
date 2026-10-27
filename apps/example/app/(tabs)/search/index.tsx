import { router, Stack } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import React, { useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated'

import { useChatGeneration } from '../../../src/chat/useChatGeneration'
import { SimulatorNotice } from '../../../src/components/SimulatorNotice'
import {
  type Note,
  type SearchResult,
  useSemanticSearch,
} from '../../../src/search/useSemanticSearch'
import { useModels } from '../../../src/store/models'
import { onAccent } from '../../../src/theme/brand'
import { colors } from '../../../src/theme/colors'

function NoteRow({
  note,
  onDelete,
}: {
  note: Note | SearchResult
  // Only notes the user added can be deleted
  onDelete?: () => void
}) {
  const score = 'score' in note ? note.score : null
  return (
    <Animated.View entering={FadeIn} layout={LinearTransition.springify()}>
      <Pressable
        disabled={!onDelete}
        onLongPress={() =>
          Alert.alert('Delete this note?', note.text, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onDelete },
          ])
        }
        style={styles.note}
      >
        <Text style={styles.noteText}>{note.text}</Text>
        {score !== null && (
          <View style={styles.relevance}>
            <View style={styles.track}>
              <View
                style={[
                  styles.bar,
                  { width: `${Math.max(0, Math.min(1, score)) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.score}>{Math.round(score * 100)}%</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  )
}

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const { notes, results, isIndexing, error, addNote, deleteNote } =
    useSemanticSearch(query)
  const { send } = useChatGeneration()
  const { selectedModel } = useModels()

  // Answers the query in a new chat, grounded in the closest notes
  const askInChat = () => {
    if (!results) return
    const context = results
      .slice(0, 5)
      .map((note) => `- ${note.text}`)
      .join('\n')
    const messageId = send(
      `Using only my notes below, answer: ${query.trim()}\n\nMy notes:\n${context}`,
      [],
      { newChat: true, title: `Notes: ${query.trim()}` }
    )
    // Nothing is sent while another reply is generating
    if (messageId) router.navigate('/chat')
  }

  const status = error ? (
    <Text style={styles.status}>Search is unavailable: {error}</Text>
  ) : isIndexing ? (
    <Text style={styles.status}>Reading your notes…</Text>
  ) : results ? (
    <View style={styles.resultsHeader}>
      <Text style={[styles.status, styles.resultsTitle]}>
        Closest in meaning to “{query.trim()}”
      </Text>
      {selectedModel && results.length > 0 && (
        <Pressable onPress={askInChat} hitSlop={8} style={styles.ask}>
          <SymbolView name="sparkles" size={14} tintColor={onAccent} />
          <Text style={styles.askText}>Ask in Chat</Text>
        </Pressable>
      )}
    </View>
  ) : (
    <Text style={styles.status}>
      {notes.length} notes. Search by meaning, try “pet health” or “things to
      fix at home”. Long-press your own notes to delete them.
    </Text>
  )
  const header = (
    <View style={styles.header}>
      <SimulatorNotice>
        Simulator preview: search matches shared words. On iPhone it matches
        meaning with Apple embeddings.
      </SimulatorNotice>
      {status}
    </View>
  )

  return (
    <>
      <Stack.Screen options={{ title: 'Notes', headerLargeTitle: true }} />
      <Stack.SearchBar
        placeholder="Search by meaning"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery('')}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.pencil"
          accessibilityLabel="New note"
          onPress={() =>
            Alert.prompt('New note', undefined, (text) => {
              if (text?.trim()) addNote(text.trim())
            })
          }
        />
      </Stack.Toolbar>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        style={styles.list}
        contentContainerStyle={styles.content}
        data={results ?? notes}
        keyExtractor={(note) => note.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          results ? (
            <Text style={styles.empty}>
              No notes come close. Try other words.
            </Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <NoteRow
            note={item}
            onDelete={
              item.id.startsWith('sample-')
                ? undefined
                : () => deleteNote(item.id)
            }
          />
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
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  header: {
    gap: 10,
    paddingBottom: 6,
  },
  status: {
    paddingHorizontal: 4,
    fontSize: 14,
    color: colors.secondaryLabel,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultsTitle: {
    flex: 1,
  },
  ask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
  askText: {
    fontSize: 14,
    fontWeight: '600',
    color: onAccent,
  },
  empty: {
    paddingTop: 40,
    fontSize: 16,
    textAlign: 'center',
    color: colors.secondaryLabel,
  },
  note: {
    padding: 16,
    gap: 10,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: colors.secondarySystemBackground,
  },
  noteText: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.label,
  },
  relevance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.tertiarySystemFill,
  },
  bar: {
    height: 4,
    backgroundColor: colors.accent,
  },
  score: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    color: colors.secondaryLabel,
  },
})
