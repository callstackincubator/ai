import {
  Announcement,
  HomeBanner,
  HomeFeature,
  HomeFooter,
  HomeHero,
  OutlineCTA,
  PrevNextPage,
  VersionBadge,
} from '@callstack/rspress-theme';
import {
  HomeLayout as RspressHomeLayout,
  Layout as RspressLayout,
} from 'rspress/theme';

const Layout = () => {
  return (
    <RspressLayout
      beforeDocContent={<VersionBadge version="v5" />}
      afterOutline={<OutlineCTA href="https://callstack.com" />}
    />
  );
};

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
  );
};

export { Layout, HomeLayout, PrevNextPage, HomeFeature, HomeHero };

export * from 'rspress/theme';
