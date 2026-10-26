import {
  applePhysicalDevice,
  applePlatform,
  appleSimulator,
} from '@react-native-harness/platform-apple'

const deviceName = process.env.HARNESS_IOS_DEVICE
// Builds signed with entitlements the default App ID lacks use another one
const bundleId = process.env.HARNESS_IOS_BUNDLE_ID ?? 'com.callstack.ai.example'

// Tests run in a debug build of the app. The ios runner uses the physical
// device named with HARNESS_IOS_DEVICE (as `xcrun devicectl list devices`
// shows it), and ios-simulator a simulator
export default {
  entryPoint: './index.js',
  appRegistryComponentName: 'main',
  runners: [
    ...(deviceName
      ? [
          applePlatform({
            name: 'ios',
            device: applePhysicalDevice(deviceName),
            bundleId,
          }),
        ]
      : []),
    applePlatform({
      name: 'ios-simulator',
      device: appleSimulator('iPhone 18 Pro', '27.0'),
      bundleId: 'com.callstack.ai.example',
    }),
  ],
  defaultRunner: deviceName ? 'ios' : 'ios-simulator',
  // On-device models load and generate slowly, but a test that hangs should
  // fail well before the run does
  bridgeTimeout: 120000,
  bundleStartTimeout: 120000,
  // Also bounds the hooks that download models on the first run, and the
  // 4 GB image model takes minutes to download
  testTimeout: 600000,
  forwardClientLogs: true,
}
