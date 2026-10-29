import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { FeatureRequirements } from '../../src/components/FeatureRequirements'
import { PrimaryButton } from '../../src/components/PrimaryButton'
import {
  features,
  useEnabledFeatures,
  useOnboarding,
} from '../../src/store/features'
import { useFeatureReadiness } from '../../src/store/readiness'
import { colors } from '../../src/theme/colors'

export default function Setup() {
  const { isEnabled } = useEnabledFeatures()
  const { setOnboarded } = useOnboarding()
  const readiness = useFeatureReadiness()

  const enabled = features.filter((feature) => isEnabled(feature.id))
  const canStart = enabled.some((feature) => readiness[feature.id])

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Set up</Text>
        <Text style={styles.subtitle}>
          Everything runs on this iPhone. Downloads happen once and keep going
          while you explore.
        </Text>
        {enabled.map((feature) => (
          <View key={feature.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{feature.title}</Text>
            <FeatureRequirements feature={feature.id} />
          </View>
        ))}
      </ScrollView>
      <PrimaryButton
        title={canStart ? 'Start' : 'Get a model to start'}
        disabled={!canStart}
        onPress={() => setOnboarded(true)}
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
    paddingBottom: 24,
    gap: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.label,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 24,
    color: colors.secondaryLabel,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.secondaryLabel,
  },
})
