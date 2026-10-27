import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  CORE_AI_LINKABLE_TASKS,
  CORE_AI_TASKS_PROPERTY,
  INCREASED_MEMORY_LIMIT_ENTITLEMENT,
  raiseDeploymentTarget,
  setCoreAIEntitlements,
  setCoreAIPodfileProperties,
  setXcodeDeploymentTarget,
} from '../expo-plugin-config'

describe('raiseDeploymentTarget', () => {
  test('raises lower and missing targets to iOS 27', () => {
    expect(raiseDeploymentTarget('15.1')).toBe('27.0')
    expect(raiseDeploymentTarget('"26.4"')).toBe('27.0')
    expect(raiseDeploymentTarget(undefined)).toBe('27.0')
  })

  test('keeps iOS 27 and higher targets', () => {
    expect(raiseDeploymentTarget('27')).toBe('27')
    expect(raiseDeploymentTarget('27.2')).toBe('27.2')
    expect(raiseDeploymentTarget('28.0')).toBe('28.0')
  })
})

describe('setCoreAIPodfileProperties', () => {
  test('raises the deployment target and links every task by default', () => {
    const properties = setCoreAIPodfileProperties({
      'expo.jsEngine': 'hermes',
      'ios.deploymentTarget': '15.1',
      [CORE_AI_TASKS_PROPERTY]: 'language',
    })

    expect(properties).toEqual({
      'expo.jsEngine': 'hermes',
      'ios.deploymentTarget': '27.0',
    })
  })

  test('writes the selected tasks for the podspec', () => {
    const properties = setCoreAIPodfileProperties(
      {},
      { tasks: ['language', 'diffusion', 'language'] }
    )

    expect(properties[CORE_AI_TASKS_PROPERTY]).toBe('language,diffusion')
    expect(properties['ios.deploymentTarget']).toBe('27.0')
  })

  test('rejects unknown and empty task lists', () => {
    expect(() =>
      setCoreAIPodfileProperties({}, { tasks: ['raw' as never] })
    ).toThrow('unknown task "raw"')
    expect(() => setCoreAIPodfileProperties({}, { tasks: [] })).toThrow(
      'must list at least one'
    )
  })

  test('accepts the same tasks as the podspec', () => {
    const podspec = readFileSync(
      join(import.meta.dir, '../../ReactNativeAICoreAI.podspec'),
      'utf8'
    )
    const podspecTasks = [
      ...podspec.matchAll(/^\s+"([a-z-]+)" => "CoreAI/gm),
    ].map((match) => match[1])

    expect(podspecTasks).toEqual([...CORE_AI_LINKABLE_TASKS])
  })
})

describe('setCoreAIEntitlements', () => {
  test('adds the increased memory limit entitlement when asked', () => {
    expect(
      setCoreAIEntitlements(
        { 'aps-environment': 'development' },
        { increasedMemoryLimit: true }
      )
    ).toEqual({
      'aps-environment': 'development',
      [INCREASED_MEMORY_LIMIT_ENTITLEMENT]: true,
    })
  })

  test('removes the entitlement when turned off', () => {
    expect(
      setCoreAIEntitlements(
        {
          'aps-environment': 'development',
          [INCREASED_MEMORY_LIMIT_ENTITLEMENT]: true,
        },
        { increasedMemoryLimit: false }
      )
    ).toEqual({ 'aps-environment': 'development' })
  })

  test('adds no entitlements by default', () => {
    expect(setCoreAIEntitlements({})).toEqual({})
    expect(setCoreAIEntitlements({}, { increasedMemoryLimit: false })).toEqual(
      {}
    )
  })
})

describe('setXcodeDeploymentTarget', () => {
  test('raises the target of every build configuration that sets one', () => {
    const configurations = setXcodeDeploymentTarget({
      debug: { buildSettings: { IPHONEOS_DEPLOYMENT_TARGET: '15.1' } },
      debug_comment: 'Debug',
      release: { buildSettings: { IPHONEOS_DEPLOYMENT_TARGET: '28.0' } },
      project: { buildSettings: { SDKROOT: 'iphoneos' } },
    })

    expect(configurations).toEqual({
      debug: { buildSettings: { IPHONEOS_DEPLOYMENT_TARGET: '27.0' } },
      debug_comment: 'Debug',
      release: { buildSettings: { IPHONEOS_DEPLOYMENT_TARGET: '28.0' } },
      project: { buildSettings: { SDKROOT: 'iphoneos' } },
    })
  })
})
