import * as Device from 'expo-device'

// Speech recognition and Apple embeddings do not run in the iOS Simulator, so
// the app swaps in stand-ins there and says so on screen
export const isSimulator = !Device.isDevice
