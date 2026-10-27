import { Stack } from 'expo-router'
import React, { useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated'

import {
  type Note,
  type SearchResult,
  useSemanticSearch,
} from '../../../src/search/useSemanticSearch'
import { colors } from '../../../src/theme/colors'

function NoteRow({ note }: { note: Note | SearchResult }) {
  const score = 'score' in note ? note.score : null
  return (
    <Animated.View
      entering={FadeIn}
      layout={LinearTransition.springify()}
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
    </Animated.View>
  )
}

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const { notes, results, isIndexing, error, addNote } =
    useSemanticSearch(query)

  const header = error ? (
    <Text style={styles.status}>Search is unavailable: {error}</Text>
  ) : isIndexing ? (
    <Text style={styles.status}>Reading your notes…</Text>
  ) : results ? (
    <Text style={styles.status}>Closest in meaning to “{query.trim()}”</Text>
  ) : (
    <Text style={styles.status}>
      {notes.length} notes. Search by meaning, try “pet health” or “things to
      fix at home”.
    </Text>
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
        renderItem={({ item }) => <NoteRow note={item} />}
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
  status: {
    paddingHorizontal: 4,
    paddingBottom: 6,
    fontSize: 14,
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
    backgroundColor: colors.systemBlue,
  },
  score: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    color: colors.secondaryLabel,
  },
})
