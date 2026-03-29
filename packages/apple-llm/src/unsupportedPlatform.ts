const PACKAGE_NAME = '@react-native-ai/apple'

function createUnsupportedPlatformError(feature: string): Error {
  return new Error(
    `${PACKAGE_NAME}: ${feature} is only available in a native React Native runtime on Apple platforms.`
  )
}

export function unsupportedSync(feature: string): never {
  throw createUnsupportedPlatformError(feature)
}

export function unsupportedAsync(feature: string): Promise<never> {
  return Promise.reject(createUnsupportedPlatformError(feature))
}
