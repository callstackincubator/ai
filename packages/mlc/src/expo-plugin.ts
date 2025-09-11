import {
  ConfigPlugin,
  createRunOncePlugin,
  withEntitlementsPlist,
} from 'expo/config-plugins'

const pkg = require('../../package.json')

const withMLCMemoryOptimization: ConfigPlugin = (config) => {
  return withEntitlementsPlist(config, (config) => {
    config.modResults['com.apple.developer.kernel.increased-memory-limit'] =
      true
    return config
  })
}

export default createRunOncePlugin(
  withMLCMemoryOptimization,
  pkg.name,
  pkg.version
)
