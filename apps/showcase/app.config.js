// Private Cloud Compute needs Apple's managed entitlement on the signing team,
// and the app crashes without it, so it is opt-in: PCC=1 npx expo prebuild
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...config.plugins,
    ...(process.env.PCC
      ? [['@react-native-ai/apple', { privateCloudCompute: true }]]
      : []),
  ],
})
