// Core AI needs an iOS 27 deployment target and has no Simulator support, so
// it is opt-in: CORE_AI=1 npx expo prebuild --clean (see react-native.config.js)
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
              ],
            },
          ],
        ]
      : []),
    ...(process.env.PCC
      ? [['@react-native-ai/apple', { privateCloudCompute: true }]]
      : []),
  ],
})
