import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PrimaryButton } from '../../src/components/PrimaryButton'
import { features, useEnabledFeatures } from '../../src/store/features'
import { colors } from '../../src/theme/colors'

export default function PickFeatures() {
  const { enabledFeatures, isEnabled, toggleFeature } = useEnabledFeatures()

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>What would you like to try?</Text>
        <Text style={styles.subtitle}>
          You can change this any time in Settings.
        </Text>
        <View style={styles.cards}>
          {features.map((feature) => {
            const selected = isEnabled(feature.id)
            return (
              <Pressable
                key={feature.id}
                onPress={() => {
                  Haptics.selectionAsync()
                  toggleFeature(feature.id)
                }}
                style={[styles.card, selected && styles.cardSelected]}
              >
                <SymbolView
                  name={feature.symbol}
                  size={28}
                  tintColor={colors.accentText}
                  style={styles.cardIcon}
                />
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{feature.title}</Text>
                  <Text style={styles.cardDescription}>
                    {feature.description}
                  </Text>
                </View>
                <SymbolView
                  name={selected ? 'checkmark.circle.fill' : 'circle'}
                  size={26}
                  tintColor={
                    selected ? colors.accentText : colors.tertiaryLabel
                  }
                />
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
      <PrimaryButton
        title="Continue"
        disabled={enabledFeatures.length === 0}
        onPress={() => router.push('/onboarding/setup')}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: colors.systemBackground,
  },
  content: {
    paddingTop: 48,
    gap: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.label,
  },
  subtitle: {
    fontSize: 17,
    color: colors.secondaryLabel,
  },
  cards: {
    marginTop: 24,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.secondarySystemBackground,
  },
  cardSelected: {
    borderColor: colors.accent,
  },
  cardIcon: {
    width: 36,
    height: 36,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.label,
  },
  cardDescription: {
    fontSize: 15,
    color: colors.secondaryLabel,
  },
})
