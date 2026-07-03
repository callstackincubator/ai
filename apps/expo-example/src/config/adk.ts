export function getGoogleApiKey(): string | undefined {
  const key = process.env.EXPO_PUBLIC_GOOGLE_API_KEY?.trim()
  return key || undefined
}

export function hasGoogleApiKey(): boolean {
  return Boolean(getGoogleApiKey())
}
