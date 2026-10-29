import { Redirect } from 'expo-router'
import React from 'react'

import {
  features,
  useEnabledFeatures,
  useOnboarding,
} from '../src/store/features'

export default function Index() {
  const { onboarded } = useOnboarding()
  const { isEnabled } = useEnabledFeatures()
  // A hidden tab can't be opened, so this goes to the first enabled one
  const firstTab = features.find((feature) => isEnabled(feature.id))?.id
  return (
    <Redirect href={onboarded ? `/${firstTab ?? 'chat'}` : '/onboarding'} />
  )
}
