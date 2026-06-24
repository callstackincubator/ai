import { Platform } from 'react-native'

import { getNativeAdkEngine } from './NativeAdkEngine'

export async function isADKNanoSupported(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false
  }

  return getNativeAdkEngine().isNanoSupported()
}
