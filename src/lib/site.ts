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

<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
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
      fontFamily: 'Terminess, Terminess Nerd Font, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
    },
  });
}
</script>

<script>
window.MathJax = {
  options: {
    ignoreHtmlClass: 'tex2jax_ignore',
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
  script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
  document.head.appendChild(script);
}
</script>
`;

function readTemplate(templatesDir: string, name: string): string {
  const templatePath = path.join(templatesDir, name);
  return fs.readFileSync(templatePath, 'utf8');
}

function writePage(outputDir: string, slug: string, html: string): void {
  const pageDir = path.join(outputDir, slug);
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(path.join(pageDir, 'index.html'), html, 'utf8');
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
    site_title: config.site.title,
    site_author: config.site.author,
    site_index_title: config.site.indexTitle,
    site_index_description: config.site.indexDescription,
    site_copyright_year: year,
    author: config.site.author,
    site_description: config.site.description,
    site_language: config.site.language,
    site_url: config.site.baseUrl,
  };

  const siteFooter = renderTemplate(config.site.footer, {
    ...baseContext,
    site_copyright_year: year,
  });

  return {
    ...baseContext,
    site_footer: siteFooter,
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
      return `<tr><td><a href="./${post.metadata.slug}/">${post.metadata.title}</a></td><td><time datetime="${post.metadata.updatedAt.toISOString()}">${formatDate(post.metadata.updatedAt)}</time></td><td><code>${post.metadata.shortHash}</code></td></tr>`;
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
  const outputDir = config.outputDir;
  const templatesDir = config.templatesDir;

  if (!fs.existsSync(postsDir)) {
    throw new Error(`Posts directory does not exist: ${postsDir}`);
  }

  const postTemplate = readTemplate(templatesDir, 'post.html');
  const indexTemplate = readTemplate(templatesDir, 'index.html');

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const themeImport = buildThemeImport(config);
  const fontImport = buildFontImport(config);

  const postSources = collectPostSources(postsDir);
  const posts = postSources.map((source) => loadPost(source));
  applyPostState(posts, getStatePath(config.sourceDir));
  const sortedPosts = sortPostsByDateDesc(posts);

  for (const post of sortedPosts) {
    const pageContext = buildTemplateContext(config, {
      title: post.metadata.title,
      date: formatDate(post.metadata.createdAt),
      created_date: formatDate(post.metadata.createdAt),
      updated_date: formatDate(post.metadata.updatedAt),
      content_hash: post.metadata.shortHash,
      content: post.bodyHtml,
      document_title: `${post.metadata.title} · ${config.site.title}`,
      document_description: `${post.metadata.title} by ${config.site.author}`,
      workbench_html: buildWorkbenchMarkup(post, config),
      workbench_script: WORKBENCH_SCRIPT,
      css_import: themeImport,
      font_import: fontImport,
    });

    const pageHtml = renderTemplate(postTemplate, pageContext);
    writePage(outputDir, post.metadata.slug, pageHtml);
  }

  const indexHtml = renderPostsIndexTemplate(sortedPosts, indexTemplate, config, themeImport, fontImport);
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml, 'utf8');
}
