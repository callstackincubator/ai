// Steps of the Expo config plugin. The plugin reads package.json relative to
// its build output, so these live apart from it to be testable from src

import type { AndroidConfig } from 'expo/config-plugins'

type PropertiesItem = AndroidConfig.Properties.PropertiesItem

// ML Kit GenAI (Gemini Nano) declares API 26 as its minimum
export const ADK_MIN_SDK_VERSION = 26

// Google GenAI libraries pulled in by ADK ship duplicates of these files
export const ADK_PACKAGING_EXCLUDES = [
  'META-INF/INDEX.LIST',
  'META-INF/DEPENDENCIES',
]

// Read by the root build.gradle that Expo generates
export const MIN_SDK_VERSION_PROPERTY = 'android.minSdkVersion'

const BUILD_GRADLE_MARKER =
  '// @react-native-ai/adk: exclude files that Google GenAI libraries duplicate'

/**
 * Raises a minSdkVersion below the API 26 that ADK needs, and keeps a higher
 * one
 */
export function raiseMinSdkVersion(current: string | undefined) {
  const version = Number(current)
  return Number.isInteger(version) && version >= ADK_MIN_SDK_VERSION
    ? String(version)
    : String(ADK_MIN_SDK_VERSION)
}

export function setAdkGradleProperties(properties: PropertiesItem[]) {
  const property = properties.find(
    (item) => item.type === 'property' && item.key === MIN_SDK_VERSION_PROPERTY
  )
  if (property?.type === 'property') {
    property.value = raiseMinSdkVersion(property.value)
  } else {
    properties.push({
      type: 'property',
      key: MIN_SDK_VERSION_PROPERTY,
      value: raiseMinSdkVersion(undefined),
    })
  }
  return properties
}

/**
 * Appends the excludes to the app's build.gradle. They add to the ones
 * expo-build-properties writes to gradle.properties, which that plugin would
 * overwrite if they were set there too
 */
export function addPackagingExcludes(buildGradle: string) {
  if (buildGradle.includes(BUILD_GRADLE_MARKER)) {
    return buildGradle
  }
  const excludes = ADK_PACKAGING_EXCLUDES.map((file) => `"${file}"`).join(', ')
  return `${buildGradle.trimEnd()}

${BUILD_GRADLE_MARKER}
android {
    packagingOptions {
        excludes += [${excludes}]
    }
}
`
}
