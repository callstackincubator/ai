import {
  type ConfigPlugin,
  createRunOncePlugin,
  withPodfileProperties,
  withXcodeProject,
} from 'expo/config-plugins'

import {
  type CoreAIPluginOptions,
  setCoreAIPodfileProperties,
  setXcodeDeploymentTarget,
} from './expo-plugin-config'

const pkg = require('../../package.json')

const withCoreAI: ConfigPlugin<CoreAIPluginOptions | void> = (
  config,
  options
) => {
  config = withPodfileProperties(config, (config) => {
    setCoreAIPodfileProperties(config.modResults, options ?? {})
    return config
  })

  return withXcodeProject(config, (config) => {
    setXcodeDeploymentTarget(config.modResults.pbxXCBuildConfigurationSection())
    return config
  })
}

export default createRunOncePlugin(withCoreAI, pkg.name, pkg.version)
