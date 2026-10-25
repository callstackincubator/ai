import { describe, expect, test } from 'bun:test'

import {
  addPackagingExcludes,
  MIN_SDK_VERSION_PROPERTY,
  raiseMinSdkVersion,
  setAdkGradleProperties,
} from '../expo-plugin-config'

describe('raiseMinSdkVersion', () => {
  test('raises lower and missing versions to API 26', () => {
    expect(raiseMinSdkVersion('24')).toBe('26')
    expect(raiseMinSdkVersion(undefined)).toBe('26')
    expect(raiseMinSdkVersion('')).toBe('26')
  })

  test('keeps API 26 and higher', () => {
    expect(raiseMinSdkVersion('26')).toBe('26')
    expect(raiseMinSdkVersion('31')).toBe('31')
  })
})

describe('setAdkGradleProperties', () => {
  test('adds minSdkVersion when it is missing', () => {
    expect(
      setAdkGradleProperties([
        { type: 'comment', value: 'Project-wide Gradle settings' },
        { type: 'property', key: 'hermesEnabled', value: 'true' },
      ])
    ).toEqual([
      { type: 'comment', value: 'Project-wide Gradle settings' },
      { type: 'property', key: 'hermesEnabled', value: 'true' },
      { type: 'property', key: MIN_SDK_VERSION_PROPERTY, value: '26' },
    ])
  })

  test('raises an existing minSdkVersion in place', () => {
    expect(
      setAdkGradleProperties([
        { type: 'property', key: MIN_SDK_VERSION_PROPERTY, value: '24' },
      ])
    ).toEqual([
      { type: 'property', key: MIN_SDK_VERSION_PROPERTY, value: '26' },
    ])
  })
})

describe('addPackagingExcludes', () => {
  const buildGradle = 'android {\n    namespace "com.example"\n}\n'

  test('appends the excludes to build.gradle', () => {
    expect(addPackagingExcludes(buildGradle)).toBe(`android {
    namespace "com.example"
}

// @react-native-ai/adk: exclude files that Google GenAI libraries duplicate
android {
    packagingOptions {
        excludes += ["META-INF/INDEX.LIST", "META-INF/DEPENDENCIES"]
    }
}
`)
  })

  test('does not add them twice', () => {
    const once = addPackagingExcludes(buildGradle)
    expect(addPackagingExcludes(once)).toBe(once)
  })
})
