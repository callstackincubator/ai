// Opt-in iOS settings for running large on-device models. Without the
// increased memory limit, iOS kills a debug build when Qwen3.5 gets several photos.
// The entitlement needs an App ID your team owns, so set both to prebuild with it:
// IOS_BUNDLE_IDENTIFIER=com.example.ai IOS_INCREASED_MEMORY_LIMIT=1 npx expo prebuild
module.exports = ({ config }) => {
  const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER
  const increasedMemoryLimit = process.env.IOS_INCREASED_MEMORY_LIMIT === '1'

  return {
    ...config,
    ios: {
      ...config.ios,
      ...(bundleIdentifier && { bundleIdentifier }),
      ...(increasedMemoryLimit && {
        entitlements: {
          ...config.ios?.entitlements,
          'com.apple.developer.kernel.increased-memory-limit': true,
        },
      }),
    },
  }
}
