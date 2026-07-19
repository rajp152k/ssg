import fs from 'node:fs';
import path from 'node:path';
import type { Meditation, Post, PostLayout } from '../types';
import { formatDate, renderTemplate } from './template';
import { collectMeditationSources, loadMeditation } from './meditation';
import { collectPostSources, createWorkAreaStyle, loadPost } from './post';
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
      background: '#0b0d10',
      primaryColor: '#17283d',
      primaryTextColor: '#e6edf3',
      primaryBorderColor: '#58a6ff',
      lineColor: '#9aa7b2',
      secondaryColor: '#172b20',
      secondaryTextColor: '#e6edf3',
      secondaryBorderColor: '#7ee787',
      tertiaryColor: '#2a2038',
      tertiaryTextColor: '#e6edf3',
      tertiaryBorderColor: '#bc8cff',
      noteBkgColor: '#332a16',
      noteTextColor: '#e6edf3',
      noteBorderColor: '#e3b341',
      edgeLabelBackground: '#12161b',
      clusterBkg: '#12161b',
      clusterBorder: '#293341',
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
    ['meditationsDir', path.resolve(config.meditationsDir)],
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

function sortPostsByRecency(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const aCreatedAt = a.metadata.createdAt;
    const bCreatedAt = b.metadata.createdAt;
    if (!aCreatedAt || !bCreatedAt) throw new Error('Posts require createdAt metadata');
    return bCreatedAt.getTime() - aCreatedAt.getTime();
  });
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
  const items = posts
    .map((post) => {
      const createdAt = post.metadata.createdAt;
      if (!createdAt) throw new Error(`Post requires createdAt metadata: ${post.metadata.source}`);
      return `<li><a href="./${escapeHtml(post.metadata.slug)}/">${escapeHtml(post.metadata.title)}</a><time datetime="${createdAt.toISOString()}">${formatDate(createdAt)}</time></li>`;
    })
    .join('\n');

  return renderTemplate(
    template,
    buildTemplateContext(config, {
      title: config.site.indexTitle,
      page_title: config.site.indexTitle,
      content: `<ul class="posts-list">${items}</ul>`,
      description: config.site.indexDescription,
      css_import: themeImport,
      font_import: fontImport,
    }),
  );
}

const MEDITATIONS_PER_PAGE = 20;

function sortMeditationsByRecency(meditations: Meditation[]): Meditation[] {
  return [...meditations].sort((a, b) => b.date.getTime() - a.date.getTime() || a.slug.localeCompare(b.slug));
}

function meditationPageHref(page: number): string {
  return page === 1 ? '/meditations/' : `/meditations/page/${page}/`;
}

function renderMeditationsIndexTemplate(
  meditations: Meditation[],
  page: number,
  totalPages: number,
  template: string,
  config: SsgConfig,
  themeImport: string,
  fontImport: string,
): string {
  const items = meditations
    .map((meditation) => `<li><a href="/meditations/${escapeHtml(meditation.slug)}/">${escapeHtml(meditation.title)}</a><time datetime="${meditation.date.toISOString()}">${formatDate(meditation.date)}</time></li>`)
    .join('\n');
  const pagination = totalPages > 1
    ? `<nav class="pagination" aria-label="Meditation pages">${Array.from({ length: totalPages }, (_, index) => {
      const pageNumber = index + 1;
      return pageNumber === page
        ? `<span aria-current="page">${pageNumber}</span>`
        : `<a href="${meditationPageHref(pageNumber)}">${pageNumber}</a>`;
    }).join('')}</nav>`
    : '';

  return renderTemplate(
    template,
    buildTemplateContext(config, {
      title: 'meditations',
      page_title: 'meditations',
      content: `<ul class="posts-list meditations-list">${items}</ul>${pagination}`,
      description: '',
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
  const meditationsDir = config.meditationsDir;
  const outputDir = config.outputDir;
  const templatesDir = config.templatesDir;

  assertSafeOutputDirectory(config);
  fs.mkdirSync(postsDir, { recursive: true });
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(meditationsDir, { recursive: true });

  const postTemplate = readTemplate(templatesDir, 'post.html');
  const pageTemplatePath = path.join(templatesDir, 'page.html');
  const pageTemplate = fs.existsSync(pageTemplatePath) ? readTemplate(templatesDir, 'page.html') : postTemplate;
  const indexTemplate = readTemplate(templatesDir, 'index.html');
  const meditationTemplatePath = path.join(templatesDir, 'meditation.html');
  const meditationTemplate = fs.existsSync(meditationTemplatePath)
    ? readTemplate(templatesDir, 'meditation.html')
    : postTemplate;

  const postSources = collectPostSources(postsDir);
  const pageSources = collectPostSources(pagesDir);
  const meditationSources = collectMeditationSources(meditationsDir);
  const posts = postSources.map((source) => loadPost(source));
  const pages = pageSources.map((source) => loadPost(source));
  const meditations = meditationSources.map((source) => loadMeditation(source));
  assertUniqueSlugs([...posts, ...pages]);
  if ([...posts, ...pages].some((post) => post.metadata.slug === 'meditations')) {
    throw new Error('The route "meditations" is reserved for the meditation index');
  }
  const meditationSlugs = new Set<string>();
  for (const meditation of meditations) {
    if (meditationSlugs.has(meditation.slug)) throw new Error(`Duplicate meditation slug "${meditation.slug}"`);
    meditationSlugs.add(meditation.slug);
  }

  const stagingDir = path.join(path.dirname(outputDir), `.${path.basename(outputDir)}.${process.pid}.tmp`);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  const buildConfig = { ...config, outputDir: stagingDir };
  const themeImport = buildThemeImport(buildConfig);
  const fontImport = buildFontImport(buildConfig);
  const sortedPosts = sortPostsByRecency(posts);
  const sortedMeditations = sortMeditationsByRecency(meditations);

  const renderDocument = (post: Post, template: string) => {
    const pageContext = buildTemplateContext(config, {
      title: escapeHtml(post.metadata.title),
      created_date: post.metadata.createdAt ? formatDate(post.metadata.createdAt) : '',
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
  for (const meditation of sortedMeditations) {
    const meditationHtml = renderTemplate(
      meditationTemplate,
      buildTemplateContext(config, {
        title: escapeHtml(meditation.title),
        date: formatDate(meditation.date),
        date_iso: meditation.date.toISOString(),
        content: meditation.bodyHtml,
        document_title: escapeHtml(`${meditation.title} · ${config.site.title}`),
        document_description: escapeHtml(`${meditation.title} by ${config.site.author}`),
        css_import: themeImport,
        font_import: fontImport,
      }),
    );
    writePage(stagingDir, path.join('meditations', meditation.slug), meditationHtml);
  }

  const totalMeditationPages = Math.max(1, Math.ceil(sortedMeditations.length / MEDITATIONS_PER_PAGE));
  for (let page = 1; page <= totalMeditationPages; page += 1) {
    const start = (page - 1) * MEDITATIONS_PER_PAGE;
    const pageMeditations = sortedMeditations.slice(start, start + MEDITATIONS_PER_PAGE);
    const meditationIndexHtml = renderMeditationsIndexTemplate(
      pageMeditations,
      page,
      totalMeditationPages,
      indexTemplate,
      buildConfig,
      themeImport,
      fontImport,
    );
    const route = page === 1 ? 'meditations' : path.join('meditations', 'page', String(page));
    writePage(stagingDir, route, meditationIndexHtml);
  }

  const indexHtml = renderPostsIndexTemplate(sortedPosts, indexTemplate, buildConfig, themeImport, fontImport);
  fs.writeFileSync(path.join(stagingDir, 'index.html'), indexHtml, 'utf8');
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.renameSync(stagingDir, outputDir);
}
