const fs = require('fs')
const path = require('path')
const { withDangerousMod } = require('expo/config-plugins')
const {
  mergeContents,
} = require('@expo/config-plugins/build/utils/generateCode')

// Xcode 27 rejects pod targets (including resource bundles) below iOS 15.
// expo-build-properties only sets the app and pod platform deployment target,
// so raise every pod target that still declares an older one.
const withPodDeploymentTarget = (config, { deploymentTarget = '15.1' } = {}) =>
  withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      )
      const podfile = fs.readFileSync(podfilePath, 'utf8')

      const result = mergeContents({
        tag: 'pod-deployment-target',
        src: podfile,
        newSrc: [
          '    installer.pods_project.targets.each do |target|',
          '      target.build_configurations.each do |config|',
          `        if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${deploymentTarget}`,
          `          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${deploymentTarget}'`,
          '        end',
          '      end',
          '    end',
        ].join('\n'),
        anchor: /post_install do \|installer\|/,
        offset: 1,
        comment: '#',
      })

      fs.writeFileSync(podfilePath, result.contents)
      return config
    },
  ])

module.exports = withPodDeploymentTarget
