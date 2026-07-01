import fs from 'node:fs';
import path from 'node:path';
import type { Post, PostLayout } from '../types';
import { renderTemplate, formatDate } from './template';
import {
  collectPostSources,
  createWorkAreaStyle,
  extractHeadingSignatures,
  loadPost,
} from './post';
import type { SsgConfig } from '../config';

type TemplateContext = Record<string, string>;

const WORKBENCH_SCRIPT = `
<script>
(function () {
  const workbench = document.querySelector('[data-workbench]');
  if (!workbench) {
    return;
  }

  const syncEnabled = workbench.dataset.syncEnabled === 'true';
  const syncSource = workbench.dataset.syncSource || 'human';
  const paneElements = Array.from(workbench.querySelectorAll('[data-scroll-pane]'));
  const paneById = new Map();
  const headingRecordsById = new Map();

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

      headingRecordsById.set(paneId, collectHeadings(content));
    }
  }

  function findActiveHeadingIndex(headings, scrollTop) {
    for (let index = headings.length - 1; index >= 0; index--) {
      if (scrollTop + 16 >= headings[index].top) {
        return index;
      }
    }

    return -1;
  }

  for (const pane of paneElements) {
    const paneId = pane.getAttribute('data-pane-id');
    if (paneId) {
      paneById.set(paneId, pane);
    }
  }

  refreshHeadingState();
  window.addEventListener('resize', refreshHeadingState);

  const applySync = () => {
    if (!syncEnabled) {
      return;
    }

    const sourcePane = paneById.get(syncSource);
    const sourceContent = sourcePane?.querySelector('[data-pane-content]');
    const sourceHeadings = headingRecordsById.get(syncSource);

    if (!(sourceContent instanceof HTMLElement) || !Array.isArray(sourceHeadings)) {
      return;
    }

    if (sourceHeadings.length === 0) {
      return;
    }

    const activeHeadingIndex = findActiveHeadingIndex(sourceHeadings, sourceContent.scrollTop);
    if (activeHeadingIndex < 0) {
      return;
    }

    for (const pane of paneElements) {
      if (pane === sourcePane) {
        continue;
      }

      const paneId = pane.getAttribute('data-pane-id');
      const targetHeadings = headingRecordsById.get(paneId || '');
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

      content.scrollTop = Math.max(0, Math.min(maxScroll, targetHeadings[activeHeadingIndex].top));
    }
  };

  const frameSync = (() => {
    let scheduled = false;
    return () => {
      if (scheduled) {
        return;
      }

      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        applySync();
      });
    };
  })();

  const sourcePane = paneById.get(syncSource);
  const sourceContent = sourcePane?.querySelector('[data-pane-content]');
  if (sourceContent instanceof HTMLElement && syncEnabled) {
    sourceContent.addEventListener('scroll', frameSync, { passive: true });
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

function buildTemplateContext(config: SsgConfig, overrides: TemplateContext): TemplateContext {
  const year = new Date().getFullYear().toString();

  const baseContext: TemplateContext = {
    site_title: config.site.title,
    site_author: config.site.author,
    site_description: config.site.description,
    site_language: config.site.language,
    site_url: config.site.baseUrl,
    site_index_title: config.site.indexTitle,
    site_index_description: config.site.indexDescription,
    site_footer: config.site.footer,
    site_copyright_year: year,
  };

  return {
    ...baseContext,
    ...overrides,
  };
}

function renderPostsIndexTemplate(posts: Post[], template: string, config: SsgConfig): string {
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

function normalizeSyncHeadings(headings: string[]): string[] {
  return headings.filter((heading) => heading.length > 0);
}

function compareStringArrays(left: string[], right: string[]): { equal: boolean; firstDifference?: number } {
  if (left.length !== right.length) {
    return {
      equal: false,
      firstDifference: Math.min(left.length, right.length),
    };
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return {
        equal: false,
        firstDifference: index,
      };
    }
  }

  return { equal: true };
}

function validateWorkbenchHeadings(post: Post): void {
  if (!post.sync.enabled) {
    return;
  }

  if (post.panes.length <= 1) {
    return;
  }

  const sourcePaneId = String(post.sync.source);
  const sourcePane = post.panes.find((pane) => String(pane.id) === sourcePaneId);
  if (!sourcePane) {
    throw new Error(`Workbench sync source "${sourcePaneId}" was not found in post: ${post.metadata.source}`);
  }

  const sourceHeadings = normalizeSyncHeadings(extractHeadingSignatures(sourcePane.rawContent));
  if (sourceHeadings.length === 0) {
    throw new Error(`Workbench sync requires matching headings in source pane "${sourcePaneId}", but none were found for post: ${post.metadata.source}`);
  }

  for (const pane of post.panes) {
    if (pane === sourcePane) {
      continue;
    }

    const targetHeadings = normalizeSyncHeadings(extractHeadingSignatures(pane.rawContent));
    const result = compareStringArrays(sourceHeadings, targetHeadings);
    if (result.equal) {
      continue;
    }

    const index = result.firstDifference ?? 0;
    const expected = sourceHeadings[index] || '<missing>';
    const actual = targetHeadings[index] || '<missing>';
    throw new Error(
      `Workbench sync headings differ for post ${post.metadata.source} between "${sourcePaneId}" and "${String(pane.id)}" at index ${index}: expected "${expected}", got "${actual}"`,
    );
  }
}

function buildWorkbenchMarkup(post: Post): string {
  const paneIds = post.panes.map((pane) => String(pane.id));
  const normalizedLayout = normalizeLayoutAreas(post.layout, paneIds);
  const gridStyle = createWorkAreaStyle(normalizedLayout);
  const styles = paneStyleMap(normalizedLayout);

  const content = post.panes
    .map((pane) => {
      const style = styles[String(pane.id)] ?? '';
      return `
      <section
        class="ssg-pane"
        data-scroll-pane
        data-pane-id="${pane.id}"
        style="${style}"
      >
        <header class="ssg-pane__header">
          <h2>${escapeHtml(String(pane.title))}</h2>
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
        gap: 1rem;
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

  const postSources = collectPostSources(postsDir);
  const posts = sortPostsByDateDesc(postSources.map((source) => loadPost(source)));

  for (const post of posts) {
    validateWorkbenchHeadings(post);

    const pageContext = buildTemplateContext(config, {
      title: post.metadata.title,
      date: formatDate(post.metadata.date),
      content: post.bodyHtml,
      document_title: `${post.metadata.title} · ${config.site.title}`,
      document_description: `${post.metadata.title} by ${config.site.author}`,
      workbench_html: buildWorkbenchMarkup(post),
      workbench_script: WORKBENCH_SCRIPT,
      sync_enabled: post.sync.enabled ? 'true' : 'false',
      sync_source: String(post.sync.source),
    });

    const pageHtml = renderTemplate(postTemplate, pageContext);
    writePage(outputDir, post.metadata.slug, pageHtml);
  }

  const indexHtml = renderPostsIndexTemplate(posts, indexTemplate, config);
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml, 'utf8');
}
