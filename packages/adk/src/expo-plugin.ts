import {
  type ConfigPlugin,
  createRunOncePlugin,
  WarningAggregator,
  withAppBuildGradle,
  withGradleProperties,
} from 'expo/config-plugins'

import {
  addPackagingExcludes,
  setAdkGradleProperties,
} from './expo-plugin-config'

const pkg = require('../../package.json')

const withAdk: ConfigPlugin = (config) => {
  config = withGradleProperties(config, (config) => {
    setAdkGradleProperties(config.modResults)
    return config
  })

  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = addPackagingExcludes(
        config.modResults.contents
      )
    } else {
      WarningAggregator.addWarningAndroid(
        pkg.name,
        'Cannot exclude META-INF/INDEX.LIST and META-INF/DEPENDENCIES from a Kotlin build.gradle. Add them to android.packagingOptions yourself'
      )
    }
    return config
  })
}

export default createRunOncePlugin(withAdk, pkg.name, pkg.version)
