// Core AI needs an iOS 27 deployment target and has no Simulator support, so
// it is opt-in: CORE_AI=1 npx expo prebuild --clean (see react-native.config.js).
// The app doesn't use it; the harness tests in harness/core-ai do
//
// Video generation needs more memory than iOS gives an app by default.
// CORE_AI=1 CORE_AI_MEMORY=1 adds the increased memory limit entitlement,
// which the signing team's App ID must have
//
// Private Cloud Compute needs Apple's managed entitlement on the signing team,
// and the app crashes without it, so it is opt-in too: PCC=1 npx expo prebuild
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...config.plugins,
    ...(process.env.CORE_AI
      ? [
          [
            '@react-native-ai/core-ai',
            {
              tasks: [
                'language',
                'diffusion',
                'object-detection',
                'segmentation',
                'asr',
                'video-segmentation',
                'video-diffusion',
              ],
              increasedMemoryLimit: process.env.CORE_AI_MEMORY === '1',
            },
          ],
        ]
      : []),
    ...(process.env.PCC
      ? [['@react-native-ai/apple', { privateCloudCompute: true }]]
      : []),
  ],
})
