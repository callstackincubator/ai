import { Redirect } from 'expo-router'
import React from 'react'

import { useOnboarding } from '../src/store/features'

export default function Index() {
  const { onboarded } = useOnboarding()
  return <Redirect href={onboarded ? '/chat' : '/onboarding'} />
}
