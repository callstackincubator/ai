import path from 'node:path'
import url from 'node:url'
import { withCallstackPreset } from '@callstack/rspress-preset'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default withCallstackPreset(
  {
    context: __dirname,
    docs: {
      title: 'React Native AI',
      description:
        'react-native-ai brings on-device LLMs capabilities to mobile React Native apps',
      rootUrl: 'https://react-native-ai.dev',
      icon: '/rspress-icon.png',
      logoLight: '/logo-light.png',
      logoDark: '/logo-dark.png',
      editUrl: 'https://github.com/callstackincubator/ai/edit/main/website/src',
      rootDir: 'src',
      socials: {
        discord: 'https://discord.com/invite/dmDkGFNj9k',
        github: 'https://github.com/callstackincubator/ai',
        x: 'https://x.com/callstackio',
      },
    },
  },
  { outDir: 'build' }
)
