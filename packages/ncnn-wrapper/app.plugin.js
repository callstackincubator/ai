const fs = require('fs')
const path = require('path')
const {
  withAppBuildGradle,
  withDangerousMod,
  createRunOncePlugin,
} = require('expo/config-plugins')

const PLUGIN_NAME = 'react-native-ai-ncnn-wrapper'
const PLUGIN_VERSION = '0.11.0'

function resolveReactNativeOnLoadTemplate(projectRoot) {
  const rnPackageJson = require.resolve('react-native/package.json', {
    paths: [projectRoot],
  })
  const rnRoot = path.dirname(rnPackageJson)

  return path.join(
    rnRoot,
    'ReactAndroid',
    'cmake-utils',
    'default-app-setup',
    'OnLoad.cpp'
  )
}

function resolveReactNativeCMakeTemplate(projectRoot) {
  const rnPackageJson = require.resolve('react-native/package.json', {
    paths: [projectRoot],
  })
  const rnRoot = path.dirname(rnPackageJson)

  return path.join(
    rnRoot,
    'ReactAndroid',
    'cmake-utils',
    'default-app-setup',
    'CMakeLists.txt'
  )
}

function ensureJniDefaultFiles(projectRoot) {
  const jniDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'jni')
  const onLoadPath = path.join(jniDir, 'OnLoad.cpp')
  const cmakePath = path.join(jniDir, 'CMakeLists.txt')

  fs.mkdirSync(jniDir, { recursive: true })

  if (fs.existsSync(onLoadPath)) {
    // Keep existing file untouched.
  } else {
    const onLoadTemplatePath = resolveReactNativeOnLoadTemplate(projectRoot)
    if (!fs.existsSync(onLoadTemplatePath)) {
      throw new Error(
        `[${PLUGIN_NAME}] Could not find React Native OnLoad template at: ${onLoadTemplatePath}`
      )
    }

    fs.copyFileSync(onLoadTemplatePath, onLoadPath)
  }

  if (fs.existsSync(cmakePath)) {
    // Keep existing file untouched.
  } else {
    const cmakeTemplatePath = resolveReactNativeCMakeTemplate(projectRoot)
    if (!fs.existsSync(cmakeTemplatePath)) {
      throw new Error(
        `[${PLUGIN_NAME}] Could not find React Native CMake template at: ${cmakeTemplatePath}`
      )
    }

    fs.copyFileSync(cmakeTemplatePath, cmakePath)
  }

  return onLoadPath
}

function ensureBuildGradleExternalNativeBuild(contents) {
  if (
    contents.includes('externalNativeBuild') &&
    contents.includes('path "src/main/jni/CMakeLists.txt"')
  ) {
    return contents
  }

  const androidBlockMatch = contents.match(/android\s*\{/)
  if (!androidBlockMatch) {
    return contents
  }

  const insertAt = androidBlockMatch.index + androidBlockMatch[0].length
  const injection = `
    externalNativeBuild {
        cmake {
            path "src/main/jni/CMakeLists.txt"
        }
    }
`

  return contents.slice(0, insertAt) + injection + contents.slice(insertAt)
}

function ensureOnLoadIncludeAndProvider(contents) {
  let next = contents

  if (!next.includes('#include <NcnnWrapperModule.h>')) {
    // Keep custom includes grouped with quoted includes near the RN generated header.
    if (next.includes('#ifdef REACT_NATIVE_APP_CODEGEN_HEADER')) {
      next = next.replace(
        '#ifdef REACT_NATIVE_APP_CODEGEN_HEADER',
        '#include <NcnnWrapperModule.h>\n#ifdef REACT_NATIVE_APP_CODEGEN_HEADER'
      )
    } else {
      next = `#include <NcnnWrapperModule.h>\n${next}`
    }
  }

  if (next.includes('if (name == NcnnWrapperModule::kModuleName)')) {
    return next
  }

  const fallbackLine = 'return autolinking_cxxModuleProvider(name, jsInvoker);'
  const providerBlock = `  if (name == NcnnWrapperModule::kModuleName) {
    return std::make_shared<NcnnWrapperModule>(jsInvoker);
  }
`

  if (next.includes(fallbackLine)) {
    return next.replace(fallbackLine, `${providerBlock}  ${fallbackLine}`)
  }

  // Fallback: inject before function end if layout differs.
  const fnEnd = next.indexOf('std::shared_ptr<TurboModule> javaModuleProvider(')
  if (fnEnd !== -1) {
    const cxxStart = next.lastIndexOf(
      'std::shared_ptr<TurboModule> cxxModuleProvider(',
      fnEnd
    )
    if (cxxStart !== -1) {
      const cxxSlice = next.slice(cxxStart, fnEnd)
      const cxxClose = cxxSlice.lastIndexOf('}')
      if (cxxClose !== -1) {
        const absoluteClose = cxxStart + cxxClose
        return (
          next.slice(0, absoluteClose) +
          `\n${providerBlock}` +
          next.slice(absoluteClose)
        )
      }
    }
  }

  return next
}

const withNcnnAndroidOnLoad = (config) =>
  withDangerousMod(config, [
    'android',
    (config) => {
      const projectRoot = config.modRequest.projectRoot
      const onLoadPath = ensureJniDefaultFiles(projectRoot)
      const before = fs.readFileSync(onLoadPath, 'utf8')
      const after = ensureOnLoadIncludeAndProvider(before)

      if (after !== before) {
        fs.writeFileSync(onLoadPath, after)
      }

      return config
    },
  ])

const withNcnnAndroidBuildGradle = (config) =>
  withAppBuildGradle(config, (config) => {
    config.modResults.contents = ensureBuildGradleExternalNativeBuild(
      config.modResults.contents
    )
    return config
  })

const withNcnnWrapperPlugin = (config) => {
  config = withNcnnAndroidBuildGradle(config)
  config = withNcnnAndroidOnLoad(config)
  return config
}

module.exports = createRunOncePlugin(
  withNcnnWrapperPlugin,
  PLUGIN_NAME,
  PLUGIN_VERSION
)
