// The published MLC iOS prebuilt has no tvm/ffi headers, so the MLC pod
// doesn't compile. Keep it Android-only until that's fixed (#193)
module.exports = {
  dependencies: {
    '@react-native-ai/mlc': { platforms: { ios: null } },
  },
}
