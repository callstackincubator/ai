module.exports = {
  dependencies: {
    // Core AI builds for iOS 27 devices only, so it is linked with CORE_AI=1
    // (see app.config.js)
    ...(!process.env.CORE_AI && {
      '@react-native-ai/core-ai': { platforms: { ios: null } },
    }),
  },
}
