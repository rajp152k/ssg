---
title: Markdown Niceties Test
date: 2026-07-03
slug: markdown-niceties-test
---

This post is a visual smoke test for the basic Markdown niceties supported by the generator: Mermaid diagrams, LaTeX math, syntax-highlight-ready code fences, and boxed images with captions.

## Mermaid

```mermaid
graph TD
  A[Markdown source] --> B[SSG renderer]
  B --> C[Mermaid block]
  B --> D[MathJax math]
  B --> E[Code block]
  B --> F[Captioned image]
```

## LaTeX math

Inline math should stay readable: $E = mc^2$.

Display math should be picked up by MathJax:

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

## Syntax block

```ts
type Nicety = 'mermaid' | 'latex' | 'code' | 'image';

const enabled: Nicety[] = ['mermaid', 'latex', 'code', 'image'];

for (const feature of enabled) {
  console.log(`render ${feature}`);
}
```

## Boxed image with caption

The image title is preferred as the figure caption:

![Placeholder architecture diagram](https://placehold.co/720x320?text=Markdown+Niceties "Markdown niceties rendered by the SSG")

If no title is present, the alt text becomes the caption:

![Fallback alt caption](https://placehold.co/480x220?text=Alt+Caption)

## Combined note

This page should make regressions obvious during manual review: the diagram should render, math should typeset, the TypeScript block should remain formatted, and images should sit inside bordered figure boxes with captions.
