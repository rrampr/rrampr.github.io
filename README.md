# rrampr.com

Personal blog. Static site, built with Astro, deployed to GitHub Pages on push
to `main`.

## Running it

Node 24 is required (Astro 7 needs ≥22.23.4). `.nvmrc` pins the version:

```sh
nvm use          # 24.22.3
npm install
npm run dev      # http://localhost:4321
```

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server, drafts included |
| `npm run build` | Production build into `dist/`, drafts excluded |
| `npm run preview` | Serve the built output |
| `npm run check` | Type-check `.astro` and `.ts` files |
| `npm test` | Unit tests for the sketch runtime |

## Writing a post

Drop a `.mdx` file in `src/content/posts/`. The filename becomes the URL, so
`src/content/posts/why-sine-is-a-wave.mdx` serves at
`/posts/why-sine-is-a-wave/`.

```mdx
---
title: Why sine looks like a wave
description: One sentence — used in the post list, RSS, and search results.
pubDate: 2026-11-24
tags: ['math']
draft: false      # optional; drafts show in dev, never in production
updatedDate:      # optional
---
```

Frontmatter is validated against a schema at build time
(`src/content.config.ts`), so a typo in a date fails the build instead of
shipping a broken page.

### Math

`$inline$` and `$$display$$`, rendered to static HTML at build time:

```mdx
Euler's identity, $e^{i\pi} + 1 = 0$, is a special case of

$$
e^{i\theta} = \cos\theta + i\sin\theta
$$
```

No KaTeX JavaScript reaches the browser and equations never flash unstyled.
One MDX gotcha: a bare `<` inside math can be parsed as the start of a JSX
tag, so write `\lt` instead.

### Interactive figures

The point of the site. Each figure is an Astro component wrapping
`Sketch.astro`, with a `<script>` that registers a draw function against the
shared runtime in `src/scripts/sketch.ts`. Import it into a post and use it:

```mdx
import UnitCircle from '../../components/sketches/UnitCircle.astro';

<UnitCircle />
```

To build a new one, copy `src/components/sketches/UnitCircle.astro` — it is
meant as the template — and change the geometry and the draw calls. The runtime
already handles the fiddly parts:

- **Retina scaling.** Draw in CSS pixels; the backing store is sized by
  `devicePixelRatio` for you.
- **Offscreen figures stay idle.** An `IntersectionObserver` pauses the
  animation loop when the figure scrolls out of view.
- **`prefers-reduced-motion`.** Animation is suppressed, but sliders and
  dragging still work, so the figure stays explorable.
- **Resize.** A `ResizeObserver` redraws on resize and rotation.
- **Theming.** `color('--sk-sin')` reads the CSS custom properties defined in
  `src/styles/global.css`, so figures follow light/dark with no second palette
  in JavaScript.

Two rules worth keeping: define figure colours as `--sk-*` tokens rather than
literals, and give every `<Sketch>` a real `label` — it's the screen-reader
description and the no-JavaScript fallback.

### Garden notes

`src/content/garden/` holds working notes — rougher than posts, revised in
place, and excluded from RSS. Same MDX, different frontmatter (`updated`,
`status` of `seedling` / `budding` / `evergreen`).

## How it's put together

```
astro.config.mjs              site URL, integrations, Markdown processor
plugins/katex.mjs             renders $math$ to static HTML at build time
src/content.config.ts         frontmatter schemas for both collections
src/lib/content.ts            shared post/note queries and date formatting
src/scripts/sketch.ts         interactive-figure runtime (+ .test.ts)
src/components/Sketch.astro   figure shell: canvas, controls, caption
src/styles/global.css         design tokens, light and dark
.github/workflows/deploy.yml  build and publish on push to main
```

Astro 7 replaced the unified/remark pipeline with Sätteri as its default
Markdown processor, so math is handled by `plugins/katex.mjs` — a Sätteri hast
plugin that swaps Astro's `math-inline`/`math-display` code nodes for KaTeX
output. That's all `rehype-katex` ever did; doing it this way keeps the project
on Astro's supported path instead of the legacy plugin shim.

## Deployment

Push to `main`. The workflow builds and publishes; the repo needs
**Settings → Pages → Source: GitHub Actions** set once.

### Custom domain

Not yet wired — the site currently serves from `comocha.github.io`. Once
`rrampr.com` is registered:

1. Create `public/CNAME` containing one line, `rrampr.com`, and commit it. The
   file is what makes the custom domain survive each deploy; the dashboard
   setting alone can be overwritten.
2. In Cloudflare DNS, both as **DNS-only** (grey cloud) to start:
   - `@` → CNAME → `comocha.github.io` (Cloudflare flattens apex CNAMEs, which
     is tidier than four A records)
   - `www` → CNAME → `comocha.github.io`
3. Set the custom domain in Settings → Pages, wait for the certificate, then
   tick **Enforce HTTPS**.
4. Only after the certificate is issued, optionally enable the Cloudflare proxy
   with SSL mode **Full**. Proxying first is the usual way this breaks — GitHub
   can't complete its ACME challenge through Cloudflare's edge.
5. Update `site` in `astro.config.mjs` if the domain differs from
   `https://rrampr.com`. It's what canonical URLs, RSS links, and the sitemap
   are built from.
