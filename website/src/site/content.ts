// The facts every page uses, in one place: the landing pages, the docs chrome, astro.config.mjs,
// robots.txt, the structured data and the social card (scripts/og.mjs) all read this file.
// Replace every value with the product's own. Every command, package and claim must come from
// the product's docs or repo: no invented numbers, adopters, logos or testimonials.
//
// Copy rules (see the design guide): headlines run two beats, the second shown in the accent;
// ledes are one or two sentences; plain words, no "just" or "simply", no marketing adjectives.

import type { IconName } from '../components/site/icons';

export const site = {
  name: 'React Native AI',
  /** The text in the accent wordmark block, the window tags and the giant closing wordmark. */
  wordmark: 'React Native AI',
  /** The site origin, no trailing slash. Canonicals, the sitemap and robots.txt use it. */
  url: 'https://react-native-ai.dev',
  repo: 'https://github.com/callstackincubator/ai',
  /**
   * What it is, in a few words. The home page title is "Name: subtitle" (src/site/meta.ts),
   * 60 characters at most in all.
   */
  subtitle: 'The AI SDK, running on device',
  /** The motto, in two beats. Used by the hero, the social card and the banner. */
  headline: ['Your AI SDK code.', 'Running on the phone.'],
  /** The hero lede: one or two sentences, naming who it is for. */
  lede: 'Vercel AI SDK providers for React Native that run models on your users’ devices. Keep the calls you already write; the answer comes from Apple Intelligence, Gemini Nano or a model you ship, with no server and no API key.',
  /** The meta description: 160 characters at most. */
  description: 'Run Vercel AI SDK code on device in React Native: Apple Foundation Models, Core AI, Gemini Nano and llama.rn. No server, no API key, works offline.',
  install: 'npm install @react-native-ai/apple ai',
  /** The agent skill install, in the short owner/repo form. Remove it if there is no skill. */
  skill: 'npx skills add callstackincubator/ai' as string | undefined,
  /** Alt text for the social card (public/og-image.jpg): the lockup, the motto, the picture. */
  ogAlt: 'React Native AI by Callstack. Your AI SDK code. Running on the phone. A streamText call next to a phone streaming its reply offline.',
  /** Who holds the copyright in the footer: "© YEAR PRODUCT BY CALLSTACK". */
  owner: 'Callstack',
  callstack: 'https://callstack.com/?utm_source=react-native-ai.dev&utm_medium=referral',
  license: {
    name: 'MIT',
    url: 'https://github.com/callstackincubator/ai/blob/main/LICENSE',
    /** For the structured data. */
    spdx: 'https://opensource.org/licenses/MIT',
  },
  npm: 'https://www.npmjs.com/org/react-native-ai',
  discord: 'https://discord.com/invite/dmDkGFNj9k',
  /** Platforms or targets, in the order the design guide fixes for this product. */
  platforms: ['iOS', 'Android'],
  /** The main language of the source, for the structured data. */
  language: 'TypeScript',
  /**
   * The mark: a chip on a 9-step grid, pins on every side, one core in the middle. The same
   * chip the signature scene draws.
   */
  mark: [
    '..#.#.#..',
    '.........',
    '#.#####.#',
    '..#...#..',
    '#.#.#.#.#',
    '..#...#..',
    '#.#####.#',
    '.........',
    '..#.#.#..',
  ] as string[] | undefined,
};

/** Docs paths the pages link to. */
export const docs = {
  intro: '/docs',
  start: '/docs/apple/getting-started',
  polyfills: '/docs/polyfills',
  apple: '/docs/apple/getting-started',
  coreAi: '/docs/core-ai/getting-started',
  adk: '/docs/adk/getting-started',
  llama: '/docs/llama/getting-started',
  llms: '/llms.txt',
};

type Link = { text: string; href: string };

/**
 * The nav links, mono and centred. The docs header shows the ones that leave the docs (any
 * link not under /docs).
 */
export const nav: Link[] = [
  { text: 'Docs', href: docs.intro },
  { text: 'Runtimes', href: '/#runtimes' },
  { text: 'GitHub', href: site.repo },
  { text: 'Discord', href: site.discord },
];

/** The footer row, right of the copyright, on every page and in the docs. */
export const footer: Link[] = [
  { text: 'Docs', href: docs.intro },
  { text: 'llms.txt', href: docs.llms },
  { text: 'GitHub', href: site.repo },
  { text: 'Discord', href: site.discord },
  { text: `${site.license.name} license`, href: site.license.url },
  { text: 'Callstack', href: site.callstack },
];

/** Paths kept out of the sitemap. Pages rendered with `noindex` belong here too. */
export const noindexPaths = ['/404'];

/** The marquee under the hero: platforms, runtimes and the SDK, in a fixed order. */
export const marquee = [
  'iOS',
  'Android',
  'Apple Foundation Models',
  'Core AI',
  'Gemini Nano',
  'llama.rn',
  'Vercel AI SDK',
  'Expo',
];

/** The 404 line, in two beats. */
export const notFound = ['Nothing runs at this address.', `The rest of ${site.name} does.`];

/** Questions people ask, answered only from the docs. Inline `code` is allowed. */
export const faq = [
  {
    q: 'Do I have to download a model?',
    a: 'Not for Apple and Gemini Nano: they use models that ship with the operating system. The system downloads some assets, such as Apple’s embedding and transcription models, on first use. Core AI and Llama run models you ship or download.',
  },
  {
    q: 'Which devices does it run on?',
    a: 'Apple text generation needs iOS 26 on a device with Apple Intelligence turned on; embeddings and speech work on older versions. Gemini Nano needs a physical Android device with AICore support. Llama runs on iOS and Android.',
  },
  {
    q: 'Does anything leave the device?',
    a: 'No, unless you opt in. Inference runs locally. Apple’s Private Cloud Compute model and ADK’s cloud Gemini are cloud models you choose explicitly.',
  },
  {
    q: 'Which AI SDK version do I need?',
    a: 'React Native AI 0.13 and above works with AI SDK v7. Use 0.12 for v6 and 0.11 or below for v5. Every provider needs polyfills for streams and `structuredClone`.',
  },
  {
    q: 'Can I test in the iOS Simulator?',
    a: 'Yes for Apple: the Simulator uses your Mac’s Apple Intelligence once it is turned on in macOS. Core AI and Gemini Nano need a physical device.',
  },
  {
    q: 'Can I mix on-device and cloud models?',
    a: 'Yes. They are all AI SDK models, so you can pick one per call, and fall back to a cloud provider when `apple.isAvailable()` is false.',
  },
];

/** Code shown on the home page. Real snippets from the docs, simplified but never invented. */
export const code = {
  hero: `import { apple } from '@react-native-ai/apple'
import { streamText } from 'ai'

const result = streamText({
  model: apple(),
  prompt: 'Plan a 3-day trip to Kyoto',
})

for await (const delta of result.textStream) {
  setReply((text) => text + delta)
}`,
  apple: `import { apple } from '@react-native-ai/apple'
import { streamText } from 'ai'

const result = streamText({
  model: apple(),
  prompt: 'Summarize my notes',
})`,
  coreAi: `import { coreAI } from '@react-native-ai/core-ai'
import { streamText } from 'ai'

const result = streamText({
  model: coreAI.languageModel({
    id: 'qwen3-0.6b',
    source: qwen3ModelDirectory,
  }),
  prompt: 'Summarize my notes',
})`,
  adk: `import { adk } from '@react-native-ai/adk'
import { streamText } from 'ai'

const result = streamText({
  model: adk(),
  prompt: 'Summarize my notes',
})`,
  llama: `import { downloadModel, llama } from '@react-native-ai/llama'
import { streamText } from 'ai'

const path = await downloadModel(
  'bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf'
)
const model = llama.languageModel(path)
await model.prepare()

const result = streamText({ model, prompt: 'Summarize my notes' })`,
  history: `import { apple } from '@react-native-ai/apple'
import { wrapLanguageModelWithHistory } from '@react-native-ai/utils'
import { streamText } from 'ai'

const model = wrapLanguageModelWithHistory(apple(), {
  rollingWindowMessages: 12,
  dropCompletedToolCalls: true,
})

const result = streamText({ model, messages })`,
};

/** The runtimes, in the fixed order. `owner` says who builds the native side. */
export const runtimes = [
  {
    id: 'apple',
    name: 'Apple',
    runtime: 'Foundation Models',
    platforms: 'iOS 26+',
    pkg: '@react-native-ai/apple',
    models: 'Built in: Apple Intelligence',
    owner: 'native' as const,
    body: 'The model that ships with iOS, plus embeddings, transcription and speech from Apple’s own frameworks.',
    href: docs.apple,
    file: 'apple.ts',
    code: code.apple,
  },
  {
    id: 'core-ai',
    name: 'Core AI',
    runtime: 'Core AI',
    platforms: 'iOS 27+',
    pkg: '@react-native-ai/core-ai',
    models: 'Yours: exported or hosted .aimodel bundles',
    owner: 'native' as const,
    body: 'Apple’s runtime for models you ship: text, image prompts, image generation, transcription, embeddings and vision tasks.',
    href: docs.coreAi,
    file: 'core-ai.ts',
    code: code.coreAi,
  },
  {
    id: 'adk',
    name: 'ADK',
    runtime: 'Gemini Nano via AICore',
    platforms: 'Android 14+',
    pkg: '@react-native-ai/adk',
    models: 'Built in: Gemini Nano',
    owner: 'native' as const,
    body: 'Google’s on-device Gemini through the Agent Development Kit, with tool calling and an opt-in cloud Gemini.',
    href: docs.adk,
    file: 'adk.ts',
    code: code.adk,
  },
  {
    id: 'llama',
    name: 'Llama',
    runtime: 'llama.cpp via llama.rn',
    platforms: 'iOS and Android',
    pkg: '@react-native-ai/llama',
    models: 'Any GGUF from Hugging Face',
    owner: 'community' as const,
    body: 'The portable option: an AI SDK provider over the community llama.rn binding, for any GGUF model on both platforms.',
    href: docs.llama,
    file: 'llama.ts',
    code: code.llama,
  },
];

/** The home page, section by section, in page order. index.astro only lays these out. */
export const home = {
  /** The `zsh` window beside the hero copy (hidden below 64rem): setup in a few lines. */
  setup: [
    { cmd: site.install },
    { comment: 'for you: the Apple provider and the AI SDK' },
    ...(site.skill ? [{ cmd: site.skill }, { comment: 'for your agent: the skill' }] : []),
  ] as ({ cmd: string } | { comment: string })[],

  /** The reply the phone in the hero streams in. */
  reply: [
    'Day 1: Fushimi Inari at sunrise, then Gion in the evening.',
    'Day 2: Arashiyama bamboo grove and the Tenryū-ji gardens.',
    'Day 3: Nishiki Market, then Kiyomizu-dera for the view.',
  ],

  how: {
    label: 'How it works',
    headline: ['Swap the model.', 'Keep the code.'],
    steps: [
      { title: 'Install a provider', body: 'Pick the runtime for your platform and add it next to the AI SDK.', cmd: site.install },
      { title: 'Add the polyfills', body: 'React Native needs streams and `structuredClone` for the AI SDK. One file, loaded first.', cmd: 'npm install @ungap/structured-clone @stardazed/streams-text-encoding' },
      { title: 'Call the AI SDK', body: 'Pass the provider’s model to `generateText`, `streamText`, `embed` or any other AI SDK function.', cmd: 'npx expo run:ios --device' },
    ],
    /** One tab per runtime, each with its real setup snippet. */
    tabs: runtimes.map((r) => ({
      id: r.id,
      name: r.name,
      file: r.file,
      lang: 'ts',
      code: r.code,
      pkg: r.pkg,
      note: r.owner === 'native' ? `${r.runtime}, through a native module we build.` : `${r.runtime}, through the community binding.`,
      href: r.href,
    })),
  },

  runtimes: {
    label: 'Runtimes',
    headline: ['The fastest runtime on each platform.', 'One API over all of them.'],
    lede: 'Apple, Core AI and ADK are native modules we build against each platform’s own AI stack, so they get its system models and hardware acceleration. Llama is a provider over the community llama.rn binding, for when you need the same GGUF model on iOS and Android.',
  },

  feature: {
    label: 'Small context windows',
    headline: ['Long chats,', 'small models.'],
    lede: 'On-device models have a few thousand tokens of context. Wrap any model to keep a rolling window, summarize older turns and drop finished tool calls, without changing your chat state.',
    link: { text: 'Conversation history', href: '/docs/history' },
    window: 'chat.ts',
    code: code.history,
  },

  /** Cells with a pixel icon. Keep the count divisible by 4 and 2, so no row ends half empty. */
  cells: {
    label: 'What you get',
    headline: ['The AI SDK you know,', 'on the device.'],
    items: [
      { icon: 'code', title: 'Text and streaming', body: '`generateText` and `streamText` with every provider, token by token.', href: '/docs/apple/generating' },
      { icon: 'form', title: 'Structured output', body: 'Pass a zod schema and get typed objects back from on-device models.', href: '/docs/apple/generating' },
      { icon: 'signpost', title: 'Tool calling', body: 'Models call your JavaScript functions, with Apple and ADK running the loop natively.', href: '/docs/apple/tools' },
      { icon: 'search', title: 'Embeddings and reranking', body: 'Semantic search on device with `embed`, `embedMany` and `rerank`.', href: '/docs/apple/embeddings' },
      { icon: 'flag', title: 'Transcription and speech', body: 'Speech to text with SpeechAnalyzer, and text to speech with system or GGUF voices.', href: '/docs/apple/transcription' },
      { icon: 'grid', title: 'Image generation', body: 'Generate images on iPhone with Core AI diffusion models through `generateImage`.', href: '/docs/core-ai/images-and-video' },
      { icon: 'stack', title: 'Generative UI', body: 'Build React Native views from tool calls, designed for small models. Experimental.', href: '/docs/json-ui/getting-started' },
      { icon: 'gauge', title: 'DevTools', body: 'See every AI SDK call as a trace in Rozenite, for on-device and remote models alike.', href: '/docs/dev-tools' },
    ] as { icon: IconName; title: string; body: string; href: string }[],
  },

  safe: {
    label: 'Private by default',
    headline: ['On the device.', 'Off the network.'],
    items: [
      { icon: 'lock', title: 'Data stays local', body: 'Inference runs on the device, so prompts and replies never reach a server.' },
      { icon: 'network', title: 'Works offline', body: 'No network round trip and nothing to wait for. It works in airplane mode.' },
      { icon: 'package', title: 'No keys, no bills', body: 'System models need no API key, and there is no per-token cost.' },
      { icon: 'faders', title: 'Cloud is opt-in', body: 'Private Cloud Compute and cloud Gemini run only when you ask for them.' },
    ] as { icon: IconName; title: string; body: string }[],
  },
};
