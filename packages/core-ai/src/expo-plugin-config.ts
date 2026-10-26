// Steps of the Expo config plugin. The plugin reads package.json relative to
// its build output, so these live apart from it to be testable from src

import type { CoreAIModelTask } from './types'

// Tasks the native module implements. Each one links the coreai-models
// product that runs it (see ReactNativeAICoreAI.podspec)
export const CORE_AI_LINKABLE_TASKS = [
  'language',
  'diffusion',
  'segmentation',
  'object-detection',
  'asr',

  'video-segmentation',
  'video-diffusion',
] as const satisfies readonly CoreAIModelTask[]

export type CoreAILinkableTask = (typeof CORE_AI_LINKABLE_TASKS)[number]

export type CoreAIPluginOptions = {
  // Tasks to link native support for, with the same names as a model's
  // `task`. Defaults to all of them. Tasks that are not linked reject at
  // runtime with CORE_AI_MISSING_SPM_PRODUCT
  tasks?: CoreAILinkableTask[]
}

// apple/coreai-models declares iOS 27 as its minimum platform
export const CORE_AI_DEPLOYMENT_TARGET = '27.0'

// Read by ReactNativeAICoreAI.podspec at pod install time
export const CORE_AI_TASKS_PROPERTY = 'coreAI.tasks'

function compareVersions(a: string, b: string) {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

// Raises a deployment target below the iOS 27 that Core AI needs, and keeps a
// higher one
export function raiseDeploymentTarget(current: string | undefined) {
  const version = current?.replace(/"/g, '')
  return version && compareVersions(version, CORE_AI_DEPLOYMENT_TARGET) >= 0
    ? version
    : CORE_AI_DEPLOYMENT_TARGET
}

export function validateTasks(tasks: unknown): CoreAILinkableTask[] {
  const supported = CORE_AI_LINKABLE_TASKS.join(', ')
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error(
      `@react-native-ai/core-ai: "tasks" must list at least one of ${supported}.`
    )
  }
  for (const task of tasks) {
    if (!CORE_AI_LINKABLE_TASKS.includes(task)) {
      throw new Error(
        `@react-native-ai/core-ai: unknown task "${task}" in "tasks". Use ${supported}.`
      )
    }
  }
  return [...new Set<CoreAILinkableTask>(tasks)]
}

export function setCoreAIPodfileProperties(
  properties: Record<string, string>,
  options: CoreAIPluginOptions = {}
) {
  properties['ios.deploymentTarget'] = raiseDeploymentTarget(
    properties['ios.deploymentTarget']
  )
  if (options.tasks) {
    properties[CORE_AI_TASKS_PROPERTY] = validateTasks(options.tasks).join(',')
  } else {
    delete properties[CORE_AI_TASKS_PROPERTY]
  }
  return properties
}

type BuildConfigurations = Record<
  string,
  { buildSettings?: Record<string, string> } | string
>

export function setXcodeDeploymentTarget(configurations: BuildConfigurations) {
  for (const configuration of Object.values(configurations)) {
    // The section also holds "<id>_comment" string entries
    const buildSettings =
      typeof configuration === 'object' ? configuration.buildSettings : null
    if (buildSettings?.IPHONEOS_DEPLOYMENT_TARGET) {
      buildSettings.IPHONEOS_DEPLOYMENT_TARGET = raiseDeploymentTarget(
        buildSettings.IPHONEOS_DEPLOYMENT_TARGET
      )
    }
  }
  return configurations
}
