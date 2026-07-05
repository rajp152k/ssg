# ssg

[![CI](https://github.com/rajp152k/ssg/actions/workflows/ci.yml/badge.svg)](https://github.com/rajp152k/ssg/actions/workflows/ci.yml)

A lightweight TypeScript-based static site generator for learning the architecture and growing into a real platform.

## Current architecture milestone

The current iteration implements a canvas-native static site generator:

- `content/posts` as the source of truth for posts
- canvas-style directory posts only
- `post.json` for post metadata and layout declaration
- `canvas.md` as the authored writing surface
- generated index and annotations rails for canvas posts
- SSG-owned post state in `.ssg/state.json`
- a basic template system for:
  - post pages (`templates/post.html`)
  - home page (`templates/index.html`)
- centralized config file (`ssg.config.json`)
- CLI commands:
  - `build` – render all posts to `public`
  - `dev` – local iterative workflow with watch + live reload
  - `new` – create a canvas-style post directory
- output directory: `public`

Manual tags/categories and legacy human/agent split panes are intentionally out of scope.

## Project structure

- `ssg.config.json` — site-level config used by templates
- `src/config.ts` — config loading + path resolution
- `src/cli.ts` — command entrypoint
- `src/commands/build.ts` — build command
- `src/commands/dev.ts` — dev loop command (watch + server + reload)
- `src/commands/new.ts` — canvas post scaffolding command
- `src/lib/post.ts` — canvas post loading + markdown rendering + model
- `src/lib/site.ts` — site generation and template rendering
- `src/lib/state.ts` — SSG-owned post state
- `src/lib/template.ts` — basic template rendering helpers
- `content/posts/` — canvas post directories
- `templates/` — HTML layouts, theme, and font assets

## Post model

Posts are canvas-style directories:

```text
content/posts/my-topic/
  post.json
  canvas.md
```

`post.json` keeps structure small:

```json
{
  "title": "My Topic",
  "panes": [
    { "id": "index", "title": "Index", "generated": "index", "source": "canvas" },
    { "id": "canvas", "title": "Canvas", "file": "canvas.md" },
    { "id": "annotations", "title": "Annotations", "generated": "annotations", "source": "canvas" }
  ],
  "layout": { "preset": "canvas" }
}
```

`canvas.md` is the authored surface. Headings generate the left index; inline annotation markers generate the right annotation rail.

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
    "font": "fonts/TerminessNerdFontMono-Regular.ttf"
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

Commit `.ssg/state.json`, but do not edit it manually. The post header renders created/updated dates and a short content hash from this state. Authored dates are not required; `createdAt` is assigned by the SSG state file on first build.

## Canvas posts

Directory posts can use a canvas layout with a generated index and annotation rail:

```json
{
  "title": "Canvas Layout",
  "panes": [
    { "id": "index", "generated": "index", "source": "canvas" },
    { "id": "canvas", "file": "canvas.md" },
    { "id": "annotations", "generated": "annotations", "source": "canvas" }
  ],
  "layout": { "preset": "canvas" }
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

Canvas Markdown supports:

- Mermaid fences:
  ````md
  ```mermaid
  %% caption: Optional diagram caption
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
- Markdown conversion currently uses `marked`.
- The project is intentionally scoped to the features documented above.
