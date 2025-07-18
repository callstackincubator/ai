import {
  HomeBanner,
  HomeFeature,
  HomeFooter,
  HomeHero,
  OutlineCTA,
  PrevNextPage,
} from '@callstack/rspress-theme'
import React from 'react'
import {
  HomeLayout as RspressHomeLayout,
  Layout as RspressLayout,
} from 'rspress/theme'

const Layout = () => {
  return (
    <RspressLayout afterOutline={<OutlineCTA href="https://callstack.com" />} />
  )
}

const HomeLayout = () => {
  return (
    <RspressHomeLayout
      afterFeatures={
        <>
          <HomeBanner href="https://callstack.com" />
          <HomeFooter />
        </>
      }
    />
  )
}

export { HomeFeature, HomeHero, HomeLayout, Layout, PrevNextPage }

export * from 'rspress/theme'
