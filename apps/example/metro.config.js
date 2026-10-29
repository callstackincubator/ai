// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Force Metro to resolve (sub)dependencies only from the `nodeModulesPaths`
config.resolver.disableHierarchicalLookup = true

// React Native Harness runs the tests in the harness folder at the repository root
if (process.env.RN_HARNESS) {
  config.watchFolders = [
    ...config.watchFolders,
    path.resolve(__dirname, '../../harness'),
  ]
}

module.exports = config
