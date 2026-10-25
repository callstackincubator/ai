import {
  ConfigPlugin,
  createRunOncePlugin,
  withEntitlementsPlist,
  withInfoPlist,
} from 'expo/config-plugins'

const pkg = require('../../package.json')

export type AppleLLMPluginOptions = {
  /**
   * Adds the managed Private Cloud Compute entitlement and the Info.plist key
   * that lets the `private-cloud-compute` model run. Apple grants the
   * entitlement on request, so only enable it once your team has it
   */
  privateCloudCompute?: boolean
}

const withAppleLLM: ConfigPlugin<AppleLLMPluginOptions | void> = (
  config,
  { privateCloudCompute = false } = {}
) => {
  if (!privateCloudCompute) {
    return config
  }

  config = withEntitlementsPlist(config, (config) => {
    config.modResults['com.apple.developer.private-cloud-compute'] = true
    return config
  })
  return withInfoPlist(config, (config) => {
    config.modResults.AppleLLMPrivateCloudCompute = true
    return config
  })
}

export default createRunOncePlugin(withAppleLLM, pkg.name, pkg.version)
