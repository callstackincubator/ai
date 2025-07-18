import * as path from 'node:path'

import { pluginCallstackTheme } from '@callstack/rspress-theme/plugin'
import { defineConfig } from 'rspress/config'

export default defineConfig({
  root: path.join(__dirname, 'src'),
  title: 'React Native AI',
  icon: '/rspress-icon.png',
  logo: {
    light: '/logo-light.png',
    dark: '/logo-dark.png',
  },
  globalStyles: path.join(__dirname, 'theme/styles.css'),
  themeConfig: {
    editLink: {
      docRepoBaseUrl: 'https://github.com/callstackincubator/ai/blob/main/docs',
      text: 'Edit this page on GitHub',
    },
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/callstackincubator/ai',
      },
      {
        icon: 'X',
        mode: 'link',
        content: 'https://x.com/callstackio',
      },
      {
        icon: 'discord',
        mode: 'link',
        content: 'https://discord.com/invite/dmDkGFNj9k',
      },
    ],
  },
  plugins: [pluginCallstackTheme()],
})
