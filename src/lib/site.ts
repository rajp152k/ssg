import fs from 'node:fs';
import path from 'node:path';
import type { Post, PostLayout } from '../types';
import { renderTemplate, formatDate } from './template';
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

  const syncEnabled = false;
  const syncSourcePaneId = 'human';
  const paneElements = Array.from(workbench.querySelectorAll('[data-scroll-pane]'));
  const paneById = new Map();
  const paneContentById = new Map();
  const headingRecordsById = new Map();
  const syncAnimationsById = new Map();
  const pendingSyncTimerBySourceId = new Map();
  const syncSuppressionByPaneId = new Map();

  const HEADING_OFFSET = 16;
  const SYNC_SCROLL_DURATION = 140;
  const SYNC_DEBOUNCE_MS = 90;
  const SYNC_SUPPRESSION_MS = 120;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function collectHeadings(content) {
    const headings = Array.from(content.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(
      (heading) => !heading.closest('.agent-session'),
    );

    return headings.map((heading) => ({
      top: heading.offsetTop,
    }));
  }

  function refreshHeadingState() {
    headingRecordsById.clear();

    for (const pane of paneElements) {
      const paneId = pane.getAttribute('data-pane-id');
      if (!paneId) {
        continue;
      }

      const content = pane.querySelector('[data-pane-content]');
      if (!(content instanceof HTMLElement)) {
        continue;
      }

      paneContentById.set(paneId, content);
      headingRecordsById.set(paneId, collectHeadings(content));
    }
  }

  function findActiveHeadingIndex(headings, scrollTop) {
    for (let index = headings.length - 1; index >= 0; index--) {
      if (scrollTop + HEADING_OFFSET >= headings[index].top) {
        return index;
      }
    }

    return -1;
  }

  function buildTargetTop(sourceHeadings, targetHeadings, sourceTop, activeHeadingIndex) {
    const currentSourceHeading = sourceHeadings[activeHeadingIndex];
    const nextSourceHeading = sourceHeadings[activeHeadingIndex + 1];
    const currentTargetHeading = targetHeadings[activeHeadingIndex];
    const nextTargetHeading = targetHeadings[activeHeadingIndex + 1];

    if (!nextSourceHeading || !nextTargetHeading) {
      return currentTargetHeading.top;
    }

    const sourceSpan = nextSourceHeading.top - currentSourceHeading.top;
    if (sourceSpan <= 0) {
      return currentTargetHeading.top;
    }

    const sourceProgress = clamp((sourceTop - currentSourceHeading.top) / sourceSpan, 0, 1);
    return currentTargetHeading.top + sourceProgress * (nextTargetHeading.top - currentTargetHeading.top);
  }

  function easeInOutQuad(progress) {
    return progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  }

  function scrollPaneToIndex(paneId, content, targetTop) {
    const maxScroll = content.scrollHeight - content.clientHeight;
    const destination = clamp(targetTop, 0, Math.max(0, maxScroll));
    const existing = syncAnimationsById.get(paneId);

    if (Math.abs(destination - content.scrollTop) < 1) {
      if (existing?.raf) {
        cancelAnimationFrame(existing.raf);
      }
      syncAnimationsById.delete(paneId);
      return;
    }

    if (existing && Math.abs(existing.target - destination) < 1) {
      return;
    }

    if (existing?.raf) {
      cancelAnimationFrame(existing.raf);
    }

    const state = {
      target: destination,
      from: content.scrollTop,
      startTime: performance.now(),
      raf: 0,
      isAnimating: true,
    };

    const step = (timestamp) => {
      const elapsed = timestamp - state.startTime;
      const progress = clamp(elapsed / SYNC_SCROLL_DURATION, 0, 1);
      const eased = easeInOutQuad(progress);
      content.scrollTop = state.from + (state.target - state.from) * eased;

      if (progress < 1) {
        state.raf = window.requestAnimationFrame(step);
      } else {
        syncAnimationsById.delete(paneId);
        setPaneSyncSuppressed(paneId);
      }
    };

    state.raf = window.requestAnimationFrame(step);
    state.isAnimating = true;
    syncAnimationsById.set(paneId, state);
  }

  for (const pane of paneElements) {
    const paneId = pane.getAttribute('data-pane-id');
    if (paneId) {
      paneById.set(paneId, pane);
    }
  }

  const applySync = (sourceId) => {
    if (!syncEnabled || typeof sourceId !== 'string' || sourceId !== syncSourcePaneId) {
      return;
    }

    const sourceContent = paneContentById.get(sourceId);
    const sourceHeadings = headingRecordsById.get(sourceId);
    const sourcePane = paneById.get(sourceId);

    if (!(sourceContent instanceof HTMLElement) || !Array.isArray(sourceHeadings) || !sourcePane) {
      return;
    }

    if (sourceHeadings.length === 0) {
      return;
    }

    const sourceScrollTop = sourceContent.scrollTop;
    const activeHeadingIndex = findActiveHeadingIndex(sourceHeadings, sourceScrollTop);
    if (activeHeadingIndex < 0) {
      return;
    }

    for (const pane of paneElements) {
      if (pane === sourcePane) {
        continue;
      }

      const paneId = pane.getAttribute('data-pane-id');
      if (!paneId) {
        continue;
      }

      const targetHeadings = headingRecordsById.get(paneId);
      if (!Array.isArray(targetHeadings) || !targetHeadings[activeHeadingIndex]) {
        continue;
      }

      const content = pane.querySelector('[data-pane-content]');
      if (!(content instanceof HTMLElement)) {
        continue;
      }

      const maxScroll = content.scrollHeight - content.clientHeight;
      if (maxScroll <= 0) {
        continue;
      }

      const targetTop = buildTargetTop(
        sourceHeadings,
        targetHeadings,
        sourceScrollTop + HEADING_OFFSET,
        activeHeadingIndex,
      );
      scrollPaneToIndex(paneId, content, targetTop);
    }
  };

  const scheduleSync = (sourceId) => {
    if (typeof sourceId !== 'string' || !syncEnabled) {
      return;
    }

    const prior = pendingSyncTimerBySourceId.get(sourceId);
    if (typeof prior === 'number') {
      clearTimeout(prior);
    }

    const timer = window.setTimeout(() => {
      pendingSyncTimerBySourceId.delete(sourceId);
      applySync(sourceId);
    }, SYNC_DEBOUNCE_MS);

    pendingSyncTimerBySourceId.set(sourceId, timer);
  };

  const setPaneSyncSuppressed = (paneId) => {
    syncSuppressionByPaneId.set(paneId, performance.now() + SYNC_SUPPRESSION_MS);
  };

  const clearPaneSyncSuppression = (paneId) => {
    syncSuppressionByPaneId.delete(paneId);
  };

  const isPaneSyncSuppressed = (paneId) => {
    const until = syncSuppressionByPaneId.get(paneId);
    if (typeof until !== 'number') {
      return false;
    }

    if (until <= performance.now()) {
      syncSuppressionByPaneId.delete(paneId);
      return false;
    }

    return true;
  };

  refreshHeadingState();
  window.addEventListener('resize', refreshHeadingState);

  const cancelSyncAnimation = (paneId) => {
    const state = syncAnimationsById.get(paneId);
    if (state?.raf) {
      cancelAnimationFrame(state.raf);
    }

    syncAnimationsById.delete(paneId);
    clearPaneSyncSuppression(paneId);
  };

  const cancelPendingSync = (sourceId) => {
    const prior = pendingSyncTimerBySourceId.get(sourceId);
    if (typeof prior === 'number') {
      clearTimeout(prior);
    }

    pendingSyncTimerBySourceId.delete(sourceId);
  };

  for (const pane of paneElements) {
    const paneId = pane.getAttribute('data-pane-id');
    const content = pane.querySelector('[data-pane-content]');
    if (!(content instanceof HTMLElement) || !paneId) {
      continue;
    }

    content.addEventListener(
      'scroll',
      () => {
        if (!syncEnabled) {
          return;
        }

        const state = syncAnimationsById.get(paneId);
        if (state?.isAnimating) {
          return;
        }

        if (isPaneSyncSuppressed(paneId)) {
          return;
        }

        if (paneId !== syncSourcePaneId) {
          return;
        }

        scheduleSync(paneId);
      },
      { passive: true },
    );

    content.addEventListener(
      'wheel',
      () => {
        if (!syncEnabled) {
          return;
        }

        cancelSyncAnimation(paneId);
        cancelPendingSync(paneId);
      },
      { passive: true },
    );

    content.addEventListener(
      'mousedown',
      () => {
        cancelSyncAnimation(paneId);
        cancelPendingSync(paneId);
      },
      { passive: true },
    );
  }
})();
</script>

<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
if (window.mermaid && document.querySelector('.mermaid')) {
  window.mermaid.initialize({
    startOnLoad: true,
    securityLevel: 'loose',
  });
}
</script>

<script>
window.MathJax = {
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
  const href = resolveTemplateAssetHref(config, config.site.theme ?? '', 'theme');
  return href ? buildTemplateAssetImport(href) : '';
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
    site_footer: config.site.footer,
    site_copyright_year: year,
    author: config.site.author,
    site_description: config.site.description,
    site_language: config.site.language,
    site_url: config.site.baseUrl,
  };

  return {
    ...baseContext,
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
      return `<li><a href="./${post.metadata.slug}/">${post.metadata.title}</a> <time datetime="${post.metadata.isoDate}">${formatDate(post.metadata.date)}</time></li>`;
    })
    .join('\n');

  return renderTemplate(
    template,
    buildTemplateContext(config, {
      title: config.site.indexTitle,
      page_title: config.site.indexTitle,
      content: `<ul>${items}</ul>`,
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
        gap: 0.4rem;
        height: 100%;
        min-height: 0;
      }
    </style>
    <div
      id="ssg-workbench"
      class="ssg-workbench"
      data-workbench
      data-scroll-enabled="${post.sync.enabled ? 'true' : 'false'}"
      data-sync-enabled="${post.sync.enabled ? 'true' : 'false'}"
      data-sync-source="${post.sync.source}"
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
  const posts = sortPostsByDateDesc(postSources.map((source) => loadPost(source)));

  for (const post of posts) {
    const pageContext = buildTemplateContext(config, {
      title: post.metadata.title,
      date: formatDate(post.metadata.date),
      content: post.bodyHtml,
      document_title: `${post.metadata.title} · ${config.site.title}`,
      document_description: `${post.metadata.title} by ${config.site.author}`,
      workbench_html: buildWorkbenchMarkup(post, config),
      workbench_script: WORKBENCH_SCRIPT,
      sync_enabled: post.sync.enabled ? 'true' : 'false',
      sync_source: String(post.sync.source),
      css_import: themeImport,
      font_import: fontImport,
    });

    const pageHtml = renderTemplate(postTemplate, pageContext);
    writePage(outputDir, post.metadata.slug, pageHtml);
  }

  const indexHtml = renderPostsIndexTemplate(posts, indexTemplate, config, themeImport, fontImport);
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml, 'utf8');
}
