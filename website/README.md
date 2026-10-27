# react-native-ai.dev

The React Native AI website: an Astro + Starlight site in the Callstack product look, with the
landing page, the docs, a 404, a social card, a README banner and icons. The brand is described
in [`docs/DESIGN.md`](../docs/DESIGN.md).

## Start here

1. **`src/site/content.ts`**: every fact the site shows. Name, wordmark, site URL, repo, the
   two-beat headline, subtitle (the home title is `Name: subtitle`, 60 characters at most), description, install command, nav and footer links, marquee, FAQ, the
   home page sections and their code, the optional pixel mark.
2. **`src/site/brand.ts`**: the accent, in four values. Nothing else holds an accent colour.
   The placeholder gold is there to be replaced; the family colours already taken are listed
   in the file.
3. Replace the hero visual and add a signature scene (below).
4. Write the docs in `src/content/docs/docs/` and list them in the `sidebar` in
   `astro.config.mjs`. Also set `siteDir` there if the site isn't in the repo's `website/`.
5. Run `bun run og` to render the social card, the banner and the icons into `public/`.

## Commands

Node 24 (anything from 22.18 works: `bun run og` and the configs import `.ts` files directly).

```bash
bun install
bun run dev       # http://localhost:4321
bun run build     # static site in dist/
bun run preview
bun run check     # astro check: types in .astro and .ts files
bunx playwright-core install chromium   # once, for bun run og (or have Google Chrome)
bun run og        # public/og-image.jpg, banner.jpg, favicon.svg, favicon-32.png, apple-touch-icon.png
```

The site is not a workspace of the monorepo; it has its own `bun.lock`.

`public/` holds the files `bun run og` generates, plus `dev-tools-preview.png` for the docs.

## Where things go

| Path | What it is |
| --- | --- |
| `src/site/content.ts` | Product facts and all copy |
| `src/site/brand.ts` | The accent; injected as CSS variables everywhere |
| `src/site/meta.ts` | Page titles: `Name: subtitle` on home, `Page \| Name` everywhere else; never write a separator by hand |
| `src/pages/index.astro` | Home page layout; reorder sections with `order` |
| `src/components/home/Hero.astro` | The hero. The visual sits between the `HERO VISUAL` comments |
| `src/components/home/hero.ts` | The hero animation, loaded only when the hero nears the viewport |
| `src/components/site/dither.ts` | Dithered scenes: `mark`, `hollow` (404), `flow`. Add the signature scene here |
| `src/components/site/` | Nav, Lockup, Mark, Window, CodeBlock, CopyCommand, Tabs, Marquee, Faq, PixelIcon, Closing, Footer |
| `src/pages/404.astro` | Not found, on the `hollow` scene |
| `src/pages/robots.txt.ts` | robots.txt from the site URL |
| `src/layouts/Site.astro` | Head, SEO and social tags for pages outside the docs |
| `src/components/starlight/` | Docs header lockup, header links, footer, dark default |
| `src/styles/` | `landing.css` (tokens, building blocks), `theme.css` and `docs.css` (docs) |
| `src/routeData.ts` | Docs: clean canonicals, descriptions from the first paragraph, breadcrumbs |
| `og/og.html`, `scripts/og.mjs` | Social card, banner and icons |
| `ec.config.mjs` | Docs code block colours |
| `vercel.json` | Clean URLs, no trailing slash, `/sitemap.xml` rewrite |

## The hero visual

`Hero.astro` ships a placeholder: a code window and a typing terminal on the `mark` scene.
Replace what sits between `<!-- HERO VISUAL -->` and `<!-- /HERO VISUAL -->` with the product's
story, built from Windows, CodeBlocks, `.term` transcripts, pictured panels (`.pane`) and ducts
with packets (`.duct`, `sendPacket` in `anim.ts`). Render the meaningful final state in the
HTML; `hero.ts` resets it and plays it, and reduced motion keeps the still frame. Put the same
picture on the social card between the `OG VISUAL` comments in `og/og.html`.

## The signature scene

`mark` grows the product's pixel mark into a cluster of stones; it is the fallback. Each product
should get a scene that is a metaphor for what it does. The comment at the top of `dither.ts`
says how to write one. Then use it in `Hero.astro` (`<Dither scene="…">`) and in `og/og.html`.
