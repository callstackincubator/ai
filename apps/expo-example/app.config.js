// Core AI needs an iOS 27 deployment target and has no Simulator support, so
// it is opt-in: CORE_AI=1 npx expo prebuild --clean (see react-native.config.js)
module.exports = ({ config }) => {
  if (!process.env.CORE_AI) {
    return config
  }
  return {
    ...config,
    plugins: [
      ...config.plugins,
      [
        '@react-native-ai/core-ai',
        { tasks: ['language', 'object-detection', 'segmentation'] },
      ],
    ],
  }
}
