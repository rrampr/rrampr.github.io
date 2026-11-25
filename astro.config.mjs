// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';

import { katexMath } from './plugins/katex.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://rrampr.com',
  integrations: [mdx(), sitemap()],
  markdown: {
    // Astro 7's default Markdown processor. `math: true` turns on $…$ and
    // $$…$$ parsing; katexMath then renders those to static HTML, so no KaTeX
    // JavaScript ships to the browser and equations never flash unstyled.
    processor: satteri({
      features: { math: true },
      hastPlugins: [katexMath],
    }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
