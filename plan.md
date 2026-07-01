# SSG Plan (v0.1)

## Goals
Build a static site generator that starts simple and scales into a platform for modern web content:
- fast Markdown-based publishing
- robust content modeling
- flexible templates/layouts
- plugin-oriented architecture
- modern JS bundling for interactive pages (including WebGL/WASM modules)

## What "SSG basics" we need first

### 1) Input model
- Source directory convention
  - `content/` for blog/docs/pages
  - `templates/` for layouts/components
  - `assets/` for static files (images, css, scripts)
- Supported content formats
  - Markdown + front matter (YAML/TOML)
  - (Later) MDX for interactive components

### 2) Parsing & data
- Load files recursively
- Parse front matter into typed metadata
- Convert markdown to HTML (and an AST for transforms)
- Validate required fields (slug/title/date/publish path)

### 3) Transformation pipeline
- Content transformations as ordered steps:
  - parse → slugify path → render markdown → apply transforms → render template
- Clear plugin interface so steps can be injected/reordered

### 4) Routing/output
- Deterministic URL strategy (slug/path/permalink)
- Render each page to `public/<path>/index.html`
- Asset copy and fingerprinting (hashing)
- Build manifest (`public/index.json`)

### 5) Templates
- Layout system with partials/inheritance
- Global data availability (site metadata, nav, tags)
- Theme-able via configuration

### 6) Build system
- Incremental build cache metadata (source hash → output hash)
- Watch mode (rebuild changed files)
- CLI commands
  - `ssg build`
  - `ssg serve`
  - `ssg clean`
  - `ssg new <type>` (content scaffolding)

### 7) CI/CD integration
- GitHub Action workflow for:
  - install
  - build
  - upload Pages artifact or publish to target

### 8) Modern web extension layer (phase 2+)
- Treat `assets/scripts` as entry points for modern bundles
- Integrate bundler output into generated pages
- Support WebGL scenes/components (three.js or raw WebGPU)
- Support WASM modules loaded by pages/components

### 9) Extensibility
- Plugin API (hooks)
  - `onInit`, `beforeParse`, `afterParse`, `beforeRender`, `afterRender`
- Reusable transformers for markdown shortcodes, syntax highlighting, image processing

### 10) Quality foundations
- Type-safe config (TypeScript)
- Unit + snapshot tests for transforms
- Golden-file tests for generated output
- Performance budget checks for build time + output size

## Recommended first implementation (MVP)
1. TypeScript CLI scaffold
2. `content/posts` markdown parsing
3. Front matter + slug generation
4. Single layout template + page rendering
5. `public/` output + static copy
6. `ssg build` and `ssg serve`

## Long-term differentiator
Start minimal, then add layers:
- advanced plugin system
- incremental build graph
- content collections/taxonomies
- search index generation
- image optimization pipeline
- WASM-powered transforms for speed-critical tasks
