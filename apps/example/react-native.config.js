module.exports = {
  dependencies: {
    // Core AI builds for iOS 27 devices only, so it is linked with CORE_AI=1
    // (see app.config.js)
    ...(!process.env.CORE_AI && {
      '@react-native-ai/core-ai': { platforms: { ios: null } },
    }),
    // ExecuTorch is only for the runtime benchmarks (harness/benchmarks), and
    // its native libraries are downloaded by hand, so it is linked with
    // EXECUTORCH=1
    ...(!process.env.EXECUTORCH && {
      'react-native-executorch': { platforms: { ios: null, android: null } },
    }),
  },
}
