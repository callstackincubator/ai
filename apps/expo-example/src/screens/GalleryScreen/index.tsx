import { SymbolView } from 'expo-symbols'
import * as ImagePicker from 'expo-image-picker'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { VectorIndex } from 'expo-vector-search'
import Ionicons from '@expo/vector-icons/Ionicons'

import { embedImage, embedText, getEmbeddingDimension } from './embeddingService'
import { colors } from '../../theme/colors'

type GalleryItem = {
  id: number
  uri: string
  vector: Float32Array
}

export default function GalleryScreen() {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GalleryItem[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const nextIdRef = useRef(1)
  const indexRef = useRef<VectorIndex | null>(null)

  const dim = getEmbeddingDimension()

  useEffect(() => {
    try {
      indexRef.current = new VectorIndex(dim, { metric: 'cos' })
    } catch (e) {
      console.error('Failed to create VectorIndex:', e)
    }
    return () => {
      indexRef.current?.delete()
      indexRef.current = null
    }
  }, [dim])

  const addPhotos = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      alert('Photo library permission is required')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    })
    if (result.canceled || !indexRef.current) return

    setIsAdding(true)
    try {
      const newItems: GalleryItem[] = []
      for (const asset of result.assets) {
        const uri = asset.uri
        const vector = await embedImage(uri)
        const id = nextIdRef.current++
        indexRef.current.add(id, vector)
        newItems.push({ id, uri, vector })
      }
      setItems((prev) => [...prev, ...newItems])
    } finally {
      setIsAdding(false)
    }
  }, [])

  const search = useCallback(async () => {
    if (!searchQuery.trim() || !indexRef.current || items.length === 0) return

    setIsSearching(true)
    try {
      const queryVector = embedText(searchQuery.trim())
      const results = indexRef.current.search(queryVector, Math.min(20, items.length))
      const idToItem = new Map(items.map((i) => [i.id, i]))
      const matched = results
        .map((r) => idToItem.get(r.key))
        .filter((x): x is GalleryItem => x != null)
      setSearchResults(matched)
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, items])

  const displayItems = searchQuery.trim() ? searchResults : items

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Semantic Search</Text>
        <Text style={styles.subtitle}>
          Add photos, then search by text
        </Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by description..."
          placeholderTextColor={colors.placeholderText as any}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={search}
          returnKeyType="search"
        />
        <Pressable
          style={[styles.searchButton, isSearching && styles.searchButtonDisabled]}
          onPress={search}
          disabled={isSearching}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <SymbolView
              name="magnifyingglass"
              size={20}
              tintColor="#fff"
              resizeMode="scaleAspectFit"
              fallback={<Ionicons name="search" size={20} color="#fff" />}
            />
          )}
        </Pressable>
      </View>

      <Pressable
        style={[styles.addButton, isAdding && styles.addButtonDisabled]}
        onPress={addPhotos}
        disabled={isAdding}
      >
        {isAdding ? (
          <ActivityIndicator size="small" color={colors.label as any} />
        ) : (
          <>
            <SymbolView
              name="photo.on.rectangle.angled"
              size={22}
              tintColor={colors.label as any}
              resizeMode="scaleAspectFit"
              fallback={<Ionicons name="images" size={22} color={colors.label as any} />}
            />
            <Text style={styles.addButtonText}>Add photos from gallery</Text>
          </>
        )}
      </Pressable>

      {displayItems.length === 0 ? (
        <View style={styles.empty}>
          <SymbolView
            name="photo.stack"
            size={48}
            tintColor={colors.tertiaryLabel as any}
            resizeMode="scaleAspectFit"
            fallback={<Ionicons name="images-outline" size={48} color={colors.tertiaryLabel as any} />}
          />
          <Text style={styles.emptyText}>
            {items.length === 0
              ? 'Add photos to get started'
              : searchQuery
                ? 'No matches'
                : 'Add photos to get started'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayItems}
          numColumns={3}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              <Image source={{ uri: item.uri }} style={styles.thumb} />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.systemBackground as any,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.label as any,
  },
  subtitle: {
    fontSize: 15,
    color: colors.secondaryLabel as any,
    marginTop: 4,
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.tertiarySystemBackground as any,
    fontSize: 16,
    color: colors.label as any,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.systemBlue as any,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.separator as any,
    borderStyle: 'dashed',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.label as any,
  },
  grid: {
    padding: 8,
    paddingBottom: 40,
  },
  gridItem: {
    flex: 1 / 3,
    aspectRatio: 1,
    padding: 4,
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: colors.tertiarySystemFill as any,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.secondaryLabel as any,
    textAlign: 'center',
  },
})
