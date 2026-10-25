module.exports = {
  dependencies: {
    // The published MLC iOS prebuilt has no tvm/ffi headers, so the MLC pod
    // doesn't compile. Keep it Android-only until that's fixed (#193)
    '@react-native-ai/mlc': { platforms: { ios: null } },
    // Core AI builds for iOS 27 devices only, so it is linked with CORE_AI=1
    // (see app.config.js)
    ...(!process.env.CORE_AI && {
      '@react-native-ai/core-ai': { platforms: { ios: null } },
    }),
  },
}
