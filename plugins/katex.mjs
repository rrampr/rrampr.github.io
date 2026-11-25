import katex from 'katex';
import { defineHastPlugin, htmlToHast } from 'satteri';

/**
 * Renders math to static HTML at build time.
 *
 * Astro 7 parses math itself (`features: { math: true }`), emitting the same
 * `language-math math-inline` / `math-display` code elements that remark-math
 * used to produce. This plugin swaps those for KaTeX output, which is all
 * `rehype-katex` ever did — but as a Sätteri hast plugin, so the project stays
 * on Astro's default Markdown processor rather than the legacy unified path.
 *
 * KaTeX hands back an HTML string, and a `raw` node can't be compiled to the
 * JSX that MDX targets, so the string is parsed into real element nodes before
 * being spliced in. Output is KaTeX's default HTML + MathML: the MathML is what
 * screen readers announce, which matters more than usual on a blog that is
 * largely equations.
 */

function texOf(code) {
  const first = code.children?.[0];
  return first && first.type === 'text' ? first.value : '';
}

function classesOf(node) {
  const className = node.properties?.className;
  return Array.isArray(className) ? className : [];
}

function renderToNodes(tex, displayMode) {
  const html = katex.renderToString(tex, {
    displayMode,
    // A typo in one equation shouldn't fail the whole build; KaTeX renders the
    // offending source in red instead, which is hard to miss in review.
    throwOnError: false,
    strict: false,
  });

  // `fragment: true` keeps the parser from wrapping the result in an implied
  // <html>/<head>/<body>, so these are exactly KaTeX's own top-level nodes.
  return htmlToHast(html, { fragment: true }).children ?? [];
}

export const katexMath = defineHastPlugin({
  name: 'katex-math',
  element: [
    // Display math arrives as <pre><code class="math-display">, so the <pre>
    // has to go too — a .katex-display left inside a <pre> would inherit
    // monospace and pre-wrap.
    {
      filter: ['pre'],
      visit(node, ctx) {
        const code = node.children?.[0];
        if (!code || code.type !== 'element' || code.tagName !== 'code') return;
        if (!classesOf(code).includes('math-display')) return;

        ctx.replaceNode(node, renderToNodes(texOf(code), true));
      },
    },
    // Inline math. Display-math <code> nodes are skipped here: their parent
    // <pre> is already being replaced above, and patching a node that has
    // already been removed is a dropped-patch warning.
    {
      filter: ['code'],
      visit(node, ctx) {
        if (!classesOf(node).includes('math-inline')) return;

        ctx.replaceNode(node, renderToNodes(texOf(node), false));
      },
    },
  ],
});
