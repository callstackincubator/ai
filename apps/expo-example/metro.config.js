// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config')
const { withRozenite } = require('@rozenite/metro')
const {
  wrapWithAudioAPIMetroConfig,
} = require('react-native-audio-api/metro-config')

const config = getDefaultConfig(__dirname)

// 3. Force Metro to resolve (sub)dependencies only from the `nodeModulesPaths`
config.resolver.disableHierarchicalLookup = true

module.exports = withRozenite(wrapWithAudioAPIMetroConfig(config), {
  include: ['@react-native-ai/dev-tools'],
})
