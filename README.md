# ssg

A lightweight TypeScript-based static site generator for learning the architecture and growing into a real platform.

## Current architecture milestone (MVP)

The first iteration implements:

- `content/posts` as the source of truth for pages
- Markdown files with frontmatter
- Strictly required `date` frontmatter for posts
- Optional `title` and optional `slug` in frontmatter
- A basic template system for:
  - post pages (`templates/post.html`)
  - list page (`templates/index.html`)
- Centralized config file (`ssg.config.json`)
- CLI commands:
  - `build` – render all posts to `public`
  - `dev` – local iterative workflow with watch + live reload
- Output directory: `public`

Only a date-based post model is implemented for now; tags/categories are intentionally out of scope in this phase.

## Project structure

- `ssg.config.json` — site-level config used by templates
- `src/config.ts` — config loading + path resolution
- `src/cli.ts` — command entrypoint
- `src/commands/build.ts` — build command
- `src/commands/dev.ts` — dev loop command (watch + server + reload)
- `src/lib/post.ts` — markdown + frontmatter parsing + model
- `src/lib/site.ts` — site generation and template rendering
- `src/lib/template.ts` — basic template rendering helpers
- `content/posts/` — markdown input
- `templates/` — HTML layouts

## Post model

Each post file lives under `content/posts` and must include frontmatter with at least:

- `title` (optional): defaults to file title if missing
- `date` (required): should be parseable by `new Date(value)`

Example:

```md
---
title: Welcome to my SSG
date: 2026-07-02
---

This is content in Markdown.
```

`src/lib/post.ts` parses and normalizes this into:

- `metadata.title`
- `metadata.date: Date`
- `metadata.isoDate: string`
- `metadata.slug`

## Config (`ssg.config.json`)

The config file is now a first-class way to drive templates and defaults.

```json
{
  "site": {
    "title": "yet another raj",
    "author": "Raj",
    "description": "Personal notes and experiments from building a modern TypeScript static site generator.",
    "language": "en",
    "baseUrl": "https://yetanotherraj.com",
    "indexTitle": "Posts",
    "indexDescription": "Latest posts from the journey.",
    "footer": "© 2026 Raj"
  },
  "paths": {
    "postsDir": "content/posts",
    "templatesDir": "templates",
    "outputDir": "public"
  },
  "dev": {
    "host": "127.0.0.1",
    "port": 3000
  }
}
```

These keys are available as template variables:

- `{{site_title}}`
- `{{site_author}}`
- `{{site_description}}`
- `{{site_language}}`
- `{{site_url}}`
- `{{site_index_title}}`
- `{{site_index_description}}`
- `{{site_footer}}`
- `{{site_copyright_year}}` (derived at build time)

## Commands

From repo root:

```bash
npm install
npm run build
```

Build once:

```bash
tsx src/cli.ts build
```

Iterate locally with instant feedback:

```bash
npm run dev
# opens localhost:3000 by default
npm run dev -- --port=4000
```

Test suite:

```bash
npm run test
npm run test:watch
```

`dev`:
- builds on startup
- watches `content/posts`, `templates`
- serves `public` at `http://localhost:3000`
- injects a small EventSource script into generated HTML for auto-refresh

You can also point it at a different config:

```bash
npm run build -- --config=./configs/blog.config.json
npm run dev -- --config=./configs/blog.config.json
```

## Notes

- Generated site output (`public/`) is written fresh each run.
- Frontmatter parsing currently uses `gray-matter`.
- Markdown conversion currently uses `marked`.
- This is intentionally minimal; later phases can add collections, RSS, themes, bundling, plugin hooks, and asset pipelines.
