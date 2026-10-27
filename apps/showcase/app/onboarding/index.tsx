import { router } from 'expo-router'
import { type SFSymbol, SymbolView } from 'expo-symbols'
import React, { useRef, useState } from 'react'
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BrandMark } from '../../src/components/BrandMark'
import { PrimaryButton } from '../../src/components/PrimaryButton'
import { features } from '../../src/store/features'
import { colors } from '../../src/theme/colors'

type Page = {
  symbol?: SFSymbol
  label: string
  title: string
  body: string
  highlights?: string[]
}

const pages: Page[] = [
  {
    label: 'React Native AI',
    title: 'AI that runs on your iPhone.',
    body: 'Chat, talk and search with models that live on this device. No account, no cloud, no waiting on a network.',
  },
  ...features.map((feature) => ({
    symbol: feature.symbol,
    label: feature.title,
    title: feature.description,
    body: '',
    highlights: feature.highlights,
  })),
  {
    symbol: 'lock.shield',
    label: 'Private by design',
    title: 'Nothing you say or type leaves this iPhone.',
    body: '',
    highlights: [
      'Works in airplane mode once set up',
      'Chats and notes are stored only on this device',
      'Delete models and chats any time in Settings',
    ],
  },
]

function PageView({ page, width }: { page: Page; width: number }) {
  return (
    <View style={[styles.page, { width }]}>
      {page.symbol ? (
        <View style={styles.symbolTile}>
          <SymbolView name={page.symbol} size={40} tintColor={colors.accent} />
        </View>
      ) : (
        <BrandMark size={72} />
      )}
      <Text style={styles.label}>{page.label}</Text>
      <Text style={styles.title}>{page.title}</Text>
      {page.body ? <Text style={styles.body}>{page.body}</Text> : null}
      {page.highlights?.map((highlight) => (
        <View key={highlight} style={styles.highlight}>
          <SymbolView
            name="checkmark"
            size={16}
            weight="semibold"
            tintColor={colors.accentText}
          />
          <Text style={styles.highlightText}>{highlight}</Text>
        </View>
      ))}
    </View>
  )
}

export default function Welcome() {
  const { width } = useWindowDimensions()
  const scrollRef = useRef<ScrollViewInstance>(null)
  const [index, setIndex] = useState(0)
  const isLast = index === pages.length - 1

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.pager}
      >
        {pages.map((page) => (
          <PageView key={page.label} page={page} width={width} />
        ))}
      </ScrollView>
      <Animated.View
        entering={FadeInDown.delay(300).duration(600)}
        style={styles.footer}
      >
        <View style={styles.dots}>
          {pages.map((page, i) => (
            <View
              key={page.label}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
        <PrimaryButton
          title={isLast ? 'Choose Features' : 'Continue'}
          onPress={() => {
            if (isLast) {
              router.push('/onboarding/features')
            } else {
              scrollRef.current?.scrollTo({ x: (index + 1) * width })
              setIndex(index + 1)
            }
          }}
        />
      </Animated.View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.systemBackground,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 28,
  },
  symbolTile: {
    width: 80,
    height: 80,
    borderRadius: 22,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tertiarySystemFill,
  },
  label: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.accentText,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    color: colors.label,
  },
  body: {
    fontSize: 17,
    lineHeight: 24,
    color: colors.secondaryLabel,
  },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  highlightText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 23,
    color: colors.label,
  },
  footer: {
    gap: 20,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.tertiaryLabel,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.accent,
  },
})
