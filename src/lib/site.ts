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

  const syncEnabled = workbench.dataset.syncEnabled === 'true';
  const syncSource = workbench.dataset.syncSource || 'human';
  const paneElements = Array.from(workbench.querySelectorAll('[data-scroll-pane]'));
  const paneById = new Map();
  const headingStateById = new Map();

  function normalizeHeadingText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\\s+/g, ' ')
      .replace(/[^\\w\\s-]/g, '')
      .trim();
  }

  function buildHeadingState(content) {
    const headings = Array.from(content.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const occurrenceByKey = new Map();

    const records = headings
      .map((heading) => {
        const level = heading.tagName.toLowerCase();
        const text = normalizeHeadingText(heading.textContent);
        if (!text) {
          return null;
        }

        const index = (occurrenceByKey.get(level + '|' + text) || 0) + 1;
        occurrenceByKey.set(level + '|' + text, index);
        const key = level + '|' + text + '#' + index;
        return {
          key,
          text,
          top: heading.offsetTop,
        };
      })
      .filter(Boolean);

    const byKey = new Map();
    const byText = new Map();

    for (const record of records) {
      byKey.set(record.key, record.top);
      if (!byText.has(record.text)) {
        byText.set(record.text, record.top);
      }
    }

    return {
      records,
      byKey,
      byText,
    };
  }

  function refreshHeadingState() {
    headingStateById.clear();
    for (const pane of paneElements) {
      const paneId = pane.getAttribute('data-pane-id');
      if (!paneId) {
        continue;
      }

      const content = pane.querySelector('[data-pane-content]');
      if (!(content instanceof HTMLElement)) {
        continue;
      }

      headingStateById.set(paneId, buildHeadingState(content));
    }
  }

  function findActiveHeading(records, scrollTop) {
    for (let index = records.length - 1; index >= 0; index--) {
      const record = records[index];
      if (scrollTop + 16 >= record.top) {
        return record;
      }
    }

    return null;
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
    const sourceState = headingStateById.get(syncSource);
    if (!(sourceContent instanceof HTMLElement) || !sourceState) {
      return;
    }

    const sourceMax = sourceContent.scrollHeight - sourceContent.clientHeight;
    if (sourceMax <= 0) {
      return;
    }

    const sourceActiveHeading = sourceState.records.length
      ? findActiveHeading(sourceState.records, sourceContent.scrollTop)
      : null;

    const ratio = sourceContent.scrollTop / sourceMax;

    for (const pane of paneElements) {
      if (pane === sourcePane) {
        continue;
      }

      const content = pane.querySelector('[data-pane-content]');
      if (!(content instanceof HTMLElement)) {
        continue;
      }

      const targetState = headingStateById.get(pane.getAttribute('data-pane-id'));
      if (sourceActiveHeading && targetState) {
        const maxScroll = content.scrollHeight - content.clientHeight;
        const targetTop = targetState.byKey.get(sourceActiveHeading.key)
          ?? targetState.byText.get(sourceActiveHeading.text);

        if (typeof targetTop === 'number' && maxScroll > 0) {
          content.scrollTop = Math.max(0, Math.min(maxScroll, targetTop));
          continue;
        }
      }

      const maxScroll = content.scrollHeight - content.clientHeight;
      if (maxScroll <= 0) {
        continue;
      }

      content.scrollTop = Math.round(ratio * maxScroll);
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
    sourceContent.addEventListener('scroll', frameSync);
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
