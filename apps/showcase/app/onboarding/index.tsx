import { router } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PrimaryButton } from '../../src/components/PrimaryButton'
import { features } from '../../src/store/features'
import { colors } from '../../src/theme/colors'

export default function Welcome() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View entering={FadeInDown.duration(600)}>
          <SymbolView
            name="apple.intelligence"
            size={64}
            tintColor={colors.systemIndigo}
            animationSpec={{ effect: { type: 'bounce' } }}
          />
        </Animated.View>
        <Animated.Text
          entering={FadeInDown.delay(100).duration(600)}
          style={styles.title}
        >
          AI that runs on your iPhone
        </Animated.Text>
        <Animated.Text
          entering={FadeInDown.delay(200).duration(600)}
          style={styles.subtitle}
        >
          Private, offline and fast. Nothing you say or type leaves this device.
        </Animated.Text>
        <View style={styles.features}>
          {features.map((feature, index) => (
            <Animated.View
              key={feature.id}
              entering={FadeInDown.delay(300 + index * 100).duration(600)}
              style={styles.feature}
            >
              <SymbolView
                name={feature.symbol}
                size={28}
                tintColor={colors.systemBlue}
                style={styles.featureIcon}
              />
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>
                  {feature.description}
                </Text>
              </View>
            </Animated.View>
          ))}
        </View>
      </View>
      <Animated.View entering={FadeInDown.delay(700).duration(600)}>
        <PrimaryButton
          title="Get Started"
          onPress={() => router.push('/onboarding/features')}
        />
      </Animated.View>
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
    flex: 1,
    justifyContent: 'center',
    gap: 16,
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
  features: {
    marginTop: 24,
    gap: 24,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  featureIcon: {
    width: 36,
    height: 36,
  },
  featureText: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.label,
  },
  featureDescription: {
    fontSize: 15,
    color: colors.secondaryLabel,
  },
})
