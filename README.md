# ssg

[![CI](https://github.com/rajp152k/ssg/actions/workflows/ci.yml/badge.svg)](https://github.com/rajp152k/ssg/actions/workflows/ci.yml)

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
- `content/posts/` — markdown inputs and workbench post directories (legacy `.md` + directory bundles with `post.json`)
- `templates/` — HTML layouts

## Post model

`ssg` now supports **legacy single-file posts** and **workbench posts**.

### Legacy markdown posts

Each post file under `content/posts` can be a markdown file with frontmatter:

- `title` (optional): defaults to filename
- `date` (required): should be parseable by `new Date(value)`
- `slug` (optional)

### Workbench posts

A workbench post is a directory, typically:

```text
content/posts/my-topic/
  post.json
  human.md
  agent.md
```

`post.json` controls metadata, pane order, and layout:

```json
{
  "title": "Human Agent Workbench",
  "date": "2026-07-03",
  "panes": [
    { "id": "human", "title": "Human", "file": "human.md" },
    { "id": "agent", "title": "Agent", "file": "agent.md" }
  ],
  "layout": {
    "preset": "1x2"
  },
  "sync": {
    "enabled": true,
    "source": "human"
  }
}
```

Supported pane presets:

- `1x2` (equal columns)
- `2x1` (first pane wider)

When no layout is configured, `ssg` uses `1x2`.

For synced workbench posts, headings are not validated during `build`.

At runtime, scroll sync is intentionally disabled: pane scrolling is fully decoupled, so each pane scrolls independently.


`src/lib/post.ts` normalizes both forms into a unified `Post` model so templates can render all posts consistently.
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
    "footer": "(C) {{site_copyright_year}} 'The Raj'",
    "theme": "themes/light.css",
    "assistant": "his AI"
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
- `{{author}}`
- `{{assistant}}`
- `{{css_import}}` (stylesheet tag for `site.theme`)
- `{{font_import}}` (optional stylesheet or inline font declaration for configured `site.font`)

## Styling

The generator keeps styling simple: set a single stylesheet path with `site.theme`:

```json
"site": {
  "theme": "themes/light.css"
}
```

Theme assets are copied from your `templates` directory into generated output. `{{css_import}}` injects the configured stylesheet in the `<head>` of both default templates. The bundled default stylesheet is `templates/themes/light.css`.

The default site config uses `templates/fonts/terminess.css` for a compact monospace look across prose, code, captions, and pane chrome.

If you want to bundle a custom font later, set `site.font`. CSS files are copied and linked; font assets (`woff`, `woff2`, `ttf`, `otf`, `eot`, `svg`) are copied and injected with `@font-face`.

## Post state

Posts can keep authored metadata minimal. The SSG owns `.ssg/state.json` and updates it during builds.

Per post, state tracks:

- `createdAt`
- `updatedAt`
- `contentHash`

Commit `.ssg/state.json`, but do not edit it manually. The post header renders created/updated dates and a short content hash from this state. Authored `date` metadata is optional and only seeds `createdAt` for existing/simple migration cases.

## Canvas posts

Directory posts can use a canvas layout with a generated index and annotation rail:

```json
{
  "title": "Canvas Layout",
  "date": "2026-07-03",
  "panes": [
    { "id": "index", "generated": "index", "source": "canvas" },
    { "id": "canvas", "file": "canvas.md" },
    { "id": "annotations", "generated": "annotations", "source": "canvas" }
  ],
  "layout": { "preset": "canvas" },
  "sync": { "enabled": false, "source": "canvas" }
}
```

Inline annotation syntax in `canvas.md`:

```md
Short note. [[note: This appears in the right annotation rail.]]

Longer note reference. [[@detail]]

[[annotation:detail]]
Longer annotation body.
[[/annotation]]
```

The left index is generated from canvas headings. The right annotation rail scroll-locks to the canvas and highlights the active note.

## Markdown niceties

Canvas and regular Markdown posts support:

- Mermaid fences:
  ````md
  ```mermaid
  graph TD
    A --> B
  ```
  ````
- LaTeX math via MathJax: `$x^2$` and `$$x^2$$`
- Fenced code blocks with language classes, e.g. ```` ```ts ````
- Boxed images with captions from image title or alt text:
  ```md
  ![Alt caption](diagram.png "Preferred caption")
  ```

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
- The project is intentionally scoped to the features documented above.
