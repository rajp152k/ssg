import fs from 'node:fs';
import path from 'node:path';
import type { Post, PostLayout } from '../types';
import { renderTemplate, formatDate } from './template';
import { collectPostSources, createWorkAreaStyle, loadPost } from './post';
import { applyPostState, getStatePath } from './state';
import type { SsgConfig } from '../config';

type TemplateContext = Record<string, string>;

const WORKBENCH_SCRIPT = `
<script>
(function () {
  const workbench = document.querySelector('[data-workbench]');
  if (!workbench) {
    return;
  }

  const paneContentById = new Map();
  const paneElements = Array.from(workbench.querySelectorAll('[data-scroll-pane]'));

  function refreshPaneState() {
    paneContentById.clear();
    for (const pane of paneElements) {
      const paneId = pane.getAttribute('data-pane-id');
      const content = pane.querySelector('[data-pane-content]');
      if (paneId && content instanceof HTMLElement) {
        paneContentById.set(paneId, content);
      }
    }
  }

  function syncCanvasAnnotations() {
    const canvas = paneContentById.get('canvas');
    const annotations = paneContentById.get('annotations');
    if (!(canvas instanceof HTMLElement) || !(annotations instanceof HTMLElement)) {
      return;
    }

    const refs = Array.from(canvas.querySelectorAll('[data-annotation-ref]'));
    if (refs.length === 0) {
      return;
    }

    const active = refs.reduce((current, ref) => {
      if (!(ref instanceof HTMLElement)) {
        return current;
      }

      return ref.offsetTop <= canvas.scrollTop + canvas.clientHeight * 0.4 ? ref : current;
    }, refs[0]);

    if (!(active instanceof HTMLElement)) {
      return;
    }

    const annotationId = active.getAttribute('data-annotation-ref');
    const target = annotationId ? annotations.querySelector('[data-annotation-id="' + annotationId + '"]') : null;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    annotations.querySelectorAll('[data-annotation-id]').forEach((note) => note.classList.remove('is-active'));
    target.classList.add('is-active');
    annotations.scrollTo({ top: Math.max(0, target.offsetTop - 16), behavior: 'smooth' });
  }

  refreshPaneState();
  window.addEventListener('resize', refreshPaneState);

  const canvas = paneContentById.get('canvas');
  if (canvas instanceof HTMLElement) {
    canvas.addEventListener('scroll', syncCanvasAnnotations, { passive: true });
  }

  syncCanvasAnnotations();
})();
</script>

<script src="https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.min.js"></script>
<script>
if (window.mermaid && document.querySelector('.mermaid')) {
  window.mermaid.initialize({
    startOnLoad: true,
    securityLevel: 'loose',
    theme: 'base',
    themeVariables: {
      background: '#ffffff',
      primaryColor: '#ffffff',
      primaryTextColor: '#000000',
      primaryBorderColor: '#000000',
      lineColor: '#000000',
      secondaryColor: '#ffffff',
      secondaryTextColor: '#000000',
      secondaryBorderColor: '#000000',
      tertiaryColor: '#ffffff',
      tertiaryTextColor: '#000000',
      tertiaryBorderColor: '#000000',
      noteBkgColor: '#ffffff',
      noteTextColor: '#000000',
      noteBorderColor: '#000000',
      edgeLabelBackground: '#ffffff',
      clusterBkg: '#ffffff',
      clusterBorder: '#000000',
      fontFamily: 'Iosevka, ui-monospace, monospace',
    },
  });
}
</script>

<script>
window.MathJax = {
  options: {
    ignoreHtmlClass: 'tex2jax_ignore',
  },
  output: {
    font: 'mathjax-fira',
  },
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
  },
};

const hasLatex = document.body.innerText.includes('$$') || document.body.innerText.includes('$');
if (hasLatex && !document.getElementById('mathjax-script')) {
  const script = document.createElement('script');
  script.id = 'mathjax-script';
  script.src = 'https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-mml-chtml-nofont.js';
  document.head.appendChild(script);
}
</script>
`;

function isSameOrDescendant(candidate: string, ancestor: string): boolean {
  const relative = path.relative(ancestor, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertSafeOutputDirectory(config: SsgConfig): void {
  const outputDir = path.resolve(config.outputDir);
  const sourceDir = path.resolve(config.sourceDir);
  const inputs = [
    ['postsDir', path.resolve(config.postsDir)],
    ['pagesDir', path.resolve(config.pagesDir ?? path.join(config.sourceDir, 'content', 'pages'))],
    ['templatesDir', path.resolve(config.templatesDir)],
  ] as const;

  if (outputDir === sourceDir) {
    throw new Error(`outputDir must not equal sourceDir: ${outputDir}`);
  }

  for (const [name, input] of inputs) {
    if (isSameOrDescendant(outputDir, input) || isSameOrDescendant(input, outputDir)) {
      throw new Error(`outputDir must not overlap ${name}: ${outputDir}`);
    }
  }
}

function assertUniqueSlugs(posts: Post[]): void {
  const sourceBySlug = new Map<string, string>();
  for (const post of posts) {
    const existingSource = sourceBySlug.get(post.metadata.slug);
    if (existingSource) {
      throw new Error(`Duplicate post slug "${post.metadata.slug}": ${existingSource} and ${post.metadata.source}`);
    }
    sourceBySlug.set(post.metadata.slug, post.metadata.source);
  }
}

function readTemplate(templatesDir: string, name: string): string {
  const templatePath = path.join(templatesDir, name);
  return fs.readFileSync(templatePath, 'utf8');
}

function writePage(outputDir: string, slug: string, html: string): void {
  const pageDir = path.join(outputDir, slug);
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(path.join(pageDir, 'index.html'), html, 'utf8');
}

function copyPostAssets(post: Post, outputDir: string): void {
  const sourceDir = post.metadata.source;
  const targetDir = path.join(outputDir, post.metadata.slug);
  const copy = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      const relative = path.relative(sourceDir, source);
      const target = path.join(targetDir, relative);
      if (entry.isDirectory()) {
        copy(source);
      } else if (entry.isFile() && !/\.(md|mdx|json)$/i.test(entry.name)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      }
    }
  };
  copy(sourceDir);
}

function sortPostsByDateDesc(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => b.metadata.date.getTime() - a.metadata.date.getTime());
}

function isHttpOrHttpsUrl(value: string): boolean {
  return /^[a-z]+:\/\//i.test(value);
}

function resolveTemplateAssetHref(
  config: SsgConfig,
  configuredAsset: string,
  assetKind: 'theme' | 'font',
): string {
  const source = (configuredAsset ?? '').trim();

  if (!source) {
    return '';
  }

  if (isHttpOrHttpsUrl(source)) {
    return source;
  }

  const safeAssetPath = path
    .normalize(source)
    .replace(/^[./\\]+/, '')
    .replace(/^\/+/, '');
  const templatesRoot = path.resolve(config.templatesDir);
  const sourceAssetPath = path.resolve(config.templatesDir, safeAssetPath);
  const relativeAssetPath = path.relative(templatesRoot, sourceAssetPath);

  if (relativeAssetPath.startsWith(`..${path.sep}`) || relativeAssetPath === '..') {
    throw new Error(`${assetKind} path is outside templates directory: ${source}`);
  }

  if (!fs.existsSync(sourceAssetPath)) {
    throw new Error(`${assetKind} does not exist: ${source}`);
  }

  const outputAssetPath = path.resolve(config.outputDir, relativeAssetPath);
  fs.mkdirSync(path.dirname(outputAssetPath), { recursive: true });
  fs.copyFileSync(sourceAssetPath, outputAssetPath);

  return `/${relativeAssetPath.replace(/\\/g, '/')}`;
}

function getFontFormatFromFilename(filename: string): string | null {
  const normalized = filename.split('?')[0].split('#')[0];
  const extension = path.extname(normalized).toLowerCase();

  switch (extension) {
    case '.woff2':
      return 'woff2';
    case '.woff':
      return 'woff';
    case '.ttf':
    case '.ttc':
    case '.otf':
      return 'truetype';
    case '.eot':
      return 'embedded-opentype';
    case '.svg':
      return 'svg';
    default:
      return null;
  }
}

function buildFontFamilyName(fontPath: string): string {
  const normalized = fontPath.split('?')[0].split('#')[0];
  return path.basename(normalized).replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
}

function buildTemplateAssetImport(href: string): string {
  return `<link rel="stylesheet" href="${href}" />`;
}

function buildThemeImport(config: SsgConfig): string {
  const source = (config.site.theme ?? '').trim();
  if (!source) {
    return '';
  }

  const href = resolveTemplateAssetHref(config, source, 'theme');
  return buildTemplateAssetImport(href);
}

function buildFontImport(config: SsgConfig): string {
  const source = (config.site.font ?? '').trim();
  if (!source) {
    return '';
  }

  const href = resolveTemplateAssetHref(config, source, 'font');
  const fontFormat = getFontFormatFromFilename(href);

  if (!fontFormat) {
    return buildTemplateAssetImport(href);
  }

  const fontFamily = buildFontFamilyName(source);
  const cssFontFamily = JSON.stringify(fontFamily);

  return `<style>
    @font-face {
      font-family: ${cssFontFamily};
      src: url("${href}") format("${fontFormat}");
      font-display: swap;
    }

    :root {
      --ssg-font-family: ${cssFontFamily}, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }

    body,
    pre,
    code,
    .ssg-pane,
    .ssg-pane__header,
    .ssg-pane__body {
      font-family: var(--ssg-font-family);
    }
  </style>`;
}

function buildTemplateContext(config: SsgConfig, overrides: TemplateContext): TemplateContext {
  const year = new Date().getFullYear().toString();

  const baseContext: TemplateContext = {
    site_title: escapeHtml(config.site.title),
    site_author: escapeHtml(config.site.author),
    site_index_title: escapeHtml(config.site.indexTitle),
    site_index_description: escapeHtml(config.site.indexDescription),
    site_copyright_year: year,
    author: escapeHtml(config.site.author),
    site_description: escapeHtml(config.site.description),
    site_language: escapeHtml(config.site.language),
    site_url: escapeHtml(config.site.baseUrl),
  };

  const siteNavigation = (config.site.navigation ?? [])
    .map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`)
    .join('');

  const siteFooter = renderTemplate(config.site.footer, {
    ...baseContext,
    site_copyright_year: year,
  });

  return {
    ...baseContext,
    site_footer: siteFooter,
    site_navigation: siteNavigation,
    ...overrides,
  };
}

function renderPostsIndexTemplate(
  posts: Post[],
  template: string,
  config: SsgConfig,
  themeImport: string,
  fontImport: string,
): string {
  const rows = posts
    .map((post) => {
      return `<tr><td><a href="./${escapeHtml(post.metadata.slug)}/">${escapeHtml(post.metadata.title)}</a></td><td><time datetime="${post.metadata.updatedAt.toISOString()}">${formatDate(post.metadata.updatedAt)}</time></td><td><code>${post.metadata.shortHash}</code></td></tr>`;
    })
    .join('\n');

  return renderTemplate(
    template,
    buildTemplateContext(config, {
      title: config.site.indexTitle,
      page_title: config.site.indexTitle,
      content: `<table class="posts-table"><thead><tr><th>post</th><th>updated</th><th>hash</th></tr></thead><tbody>${rows}</tbody></table>`,
      description: config.site.indexDescription,
      css_import: themeImport,
      font_import: fontImport,
    }),
  );
}

function normalizeLayoutAreas(layout: PostLayout, paneIds: string[]): PostLayout {
  const known = new Set(paneIds);
  return {
    columns: layout.columns,
    rows: layout.rows,
    areas: layout.areas.map((row) => row.map((cell) => (known.has(cell) ? cell : '.'))),
  };
}

function paneStyleMap(layout: PostLayout): Record<string, string> {
  const map: Record<string, string> = {};

  for (const row of layout.areas) {
    for (const paneId of row) {
      if (paneId && paneId !== '.') {
        map[paneId] = `grid-area: ${paneId};`;
      }
    }
  }

  return map;
}

function buildWorkbenchMarkup(post: Post, config: SsgConfig): string {
  const paneIds = post.panes.map((pane) => String(pane.id));
  const normalizedLayout = normalizeLayoutAreas(post.layout, paneIds);
  const gridStyle = createWorkAreaStyle(normalizedLayout);
  const styles = paneStyleMap(normalizedLayout);

  const content = post.panes
    .map((pane) => {
      const style = styles[String(pane.id)] ?? '';
      const paneTitle = escapeHtml(renderTemplate(String(pane.title), buildTemplateContext(config, {})));

      return `
      <section
        class="ssg-pane"
        data-scroll-pane
        data-pane-id="${pane.id}"
        style="${style}"
      >
        <header class="ssg-pane__header">
          <h2>${paneTitle}</h2>
        </header>
        <div class="ssg-pane__body" data-pane-content>${pane.bodyHtml}</div>
      </section>
      `;
    })
    .join('');

  return `
    <style>
      #ssg-workbench {
        ${gridStyle}
        display: grid;
        gap: 0.25rem;
        height: 100%;
        min-height: 0;
      }
    </style>
    <div
      id="ssg-workbench"
      class="ssg-workbench"
      data-workbench
    >
      ${content}
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildSite(config: SsgConfig): void {
  const postsDir = config.postsDir;
  const pagesDir = config.pagesDir ?? path.join(config.sourceDir, 'content', 'pages');
  const outputDir = config.outputDir;
  const templatesDir = config.templatesDir;

  assertSafeOutputDirectory(config);
  fs.mkdirSync(postsDir, { recursive: true });
  fs.mkdirSync(pagesDir, { recursive: true });

  const postTemplate = readTemplate(templatesDir, 'post.html');
  const pageTemplatePath = path.join(templatesDir, 'page.html');
  const pageTemplate = fs.existsSync(pageTemplatePath) ? readTemplate(templatesDir, 'page.html') : postTemplate;
  const indexTemplate = readTemplate(templatesDir, 'index.html');

  const postSources = collectPostSources(postsDir);
  const pageSources = collectPostSources(pagesDir);
  const posts = postSources.map((source) => loadPost(source));
  const pages = pageSources.map((source) => loadPost(source));
  assertUniqueSlugs([...posts, ...pages]);

  const stagingDir = path.join(path.dirname(outputDir), `.${path.basename(outputDir)}.${process.pid}.tmp`);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  const buildConfig = { ...config, outputDir: stagingDir };
  const themeImport = buildThemeImport(buildConfig);
  const fontImport = buildFontImport(buildConfig);
  applyPostState(posts, getStatePath(config.sourceDir));
  const sortedPosts = sortPostsByDateDesc(posts);

  const renderDocument = (post: Post, template: string) => {
    const pageContext = buildTemplateContext(config, {
      title: escapeHtml(post.metadata.title),
      date: formatDate(post.metadata.createdAt),
      created_date: formatDate(post.metadata.createdAt),
      updated_date: formatDate(post.metadata.updatedAt),
      content_hash: post.metadata.shortHash,
      content: post.bodyHtml,
      document_title: escapeHtml(`${post.metadata.title} · ${config.site.title}`),
      document_description: escapeHtml(`${post.metadata.title} by ${config.site.author}`),
      workbench_html: buildWorkbenchMarkup(post, buildConfig),
      workbench_script: WORKBENCH_SCRIPT,
      css_import: themeImport,
      font_import: fontImport,
    });

    const pageHtml = renderTemplate(template, pageContext);
    writePage(stagingDir, post.metadata.slug, pageHtml);
    copyPostAssets(post, stagingDir);
  };

  for (const post of sortedPosts) renderDocument(post, postTemplate);
  for (const page of pages) renderDocument(page, pageTemplate);

  const indexHtml = renderPostsIndexTemplate(sortedPosts, indexTemplate, buildConfig, themeImport, fontImport);
  fs.writeFileSync(path.join(stagingDir, 'index.html'), indexHtml, 'utf8');
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.renameSync(stagingDir, outputDir);
}
