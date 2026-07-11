import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import type {
  Post,
  PostLayout,
  PostPane,
  PostPaneId,
  RawPostConfig,
  RawPostLayoutConfig,
  RawPostPaneConfig,
} from '../types';
import { derivePostSlug } from './slug';

const defaultPaneDefinitions: RawPostPaneConfig[] = [
  { id: 'index', title: 'Index', generated: 'index', source: 'canvas' },
  { id: 'canvas', title: 'Canvas', file: 'canvas.md' },
  { id: 'annotations', title: 'Annotations', generated: 'annotations', source: 'canvas' },
];

const FALLBACK_TEXT = '<p><em>No content yet.</em></p>';

function normalizeHeadingText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .trim();
}

function extractHeadingTextFromToken(token: { text?: unknown; tokens?: unknown[] } | undefined): string {
  if (!token) {
    return '';
  }

  const childTokens = token.tokens;
  if (Array.isArray(childTokens) && childTokens.length > 0) {
    return childTokens.map((child) => extractHeadingTextFromToken(child as { text?: unknown; tokens?: unknown[] })).join('');
  }

  if (typeof token.text === 'string') {
    return token.text;
  }

  return '';
}

export function extractHeadingSignatures(markdown: string): string[] {
  const tokens = marked.lexer(markdown) as unknown[];
  const headings = tokens
    .filter((token): token is { type: string; depth: number } => {
      const candidate = token as { type?: string; depth?: unknown };
      return candidate.type === 'heading' && typeof candidate.depth === 'number';
    })
    .map((token) => {
      const headingToken = token as { type: string; depth: number };
      const rawText = extractHeadingTextFromToken(token as { text?: unknown; tokens?: unknown[] });
      const normalizedText = normalizeHeadingText(rawText);
      return `${headingToken.depth}:${normalizedText}`;
    })
    .filter((heading) => heading.length > 0);

  return headings;
}

function parseOptionalDate(value: string | number | undefined, sourcePath: string): Date | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value in ${sourcePath}: ${String(value)}`);
  }

  return date;
}

function buildUnstatedDate(authoredDate?: Date): Date {
  return authoredDate ?? new Date(0);
}

function inferTitleFromPath(filePath: string): string {
  const fileName = path.basename(filePath).replace(/\.(md|mdx|json)$/i, '');
  return fileName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function normalizePaneConfig(
  panes?: RawPostPaneConfig[],
): RawPostPaneConfig[] {
  const used = new Set<string>();

  if (!panes || panes.length === 0) {
    return defaultPaneDefinitions;
  }

  const normalized: RawPostPaneConfig[] = [];

  for (const pane of panes) {
    if (!pane || typeof pane.id !== 'string') {
      continue;
    }

    const id = pane.id.trim();
    if (!id || used.has(id)) {
      continue;
    }

    used.add(id);
    normalized.push({
      id,
      title: pane.title?.trim() || id,
      file: pane.file ?? `${id}.md`,
      generated: pane.generated,
      source: pane.source,
    });
  }

  return normalized.length > 0 ? normalized : defaultPaneDefinitions;
}

interface RenderedCanvas {
  bodyHtml: string;
  headings: { id: string; depth: number; text: string }[];
  annotations: { id: string; label: string; bodyHtml: string }[];
}

function slugifyFragment(value: string): string {
  return normalizeHeadingText(value).replace(/\s+/g, '-');
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractMermaidCaption(diagram: string): { caption: string; diagram: string } {
  const lines = diagram.trim().split(/\r?\n/);
  const firstLine = lines[0]?.trim() ?? '';
  const captionMatch = /^%%\s*caption:\s*(.+)$/i.exec(firstLine);

  if (!captionMatch) {
    return { caption: '', diagram: diagram.trim() };
  }

  return {
    caption: captionMatch[1].trim(),
    diagram: lines.slice(1).join('\n').trim(),
  };
}

function enhanceMarkdownHtml(html: string): string {
  return html
    .replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (_match, rawDiagram: string) => {
      const { caption, diagram } = extractMermaidCaption(decodeHtmlEntities(rawDiagram));
      const mermaid = `<pre class="mermaid">${diagram}</pre>`;
      return caption
        ? `<figure class="ssg-diagram">${mermaid}<figcaption>${escapeHtml(caption)}</figcaption></figure>`
        : mermaid;
    })
    .replace(/<p><img([^>]*)><\/p>/g, (_match, attributes: string) => {
      const title = /title="([^"]*)"/.exec(attributes)?.[1];
      const alt = /alt="([^"]*)"/.exec(attributes)?.[1];
      const caption = title || alt;
      const image = `<img${attributes}>`;

      if (!caption) {
        return `<figure class="ssg-image">${image}</figure>`;
      }

      return `<figure class="ssg-image">${image}<figcaption>${caption}</figcaption></figure>`;
    });
}

function renderMarkdownWithHeadingIds(markdown: string): { bodyHtml: string; headings: { id: string; depth: number; text: string }[] } {
  const used = new Map<string, number>();
  const headings: { id: string; depth: number; text: string }[] = [];
  const bodyHtml = enhanceMarkdownHtml(marked.parse(markdown) as string).replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_match, depthText: string, body: string) => {
    const text = stripHtml(body);
    const base = slugifyFragment(text) || 'section';
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    headings.push({ id, depth: Number(depthText), text });
    return `<h${depthText} id="${id}">${body}</h${depthText}>`;
  });

  return { bodyHtml, headings };
}

function renderCanvasMarkdown(raw: string): RenderedCanvas {
  const blockAnnotations = new Map<string, string>();
  const withoutBlocks = raw.replace(/\[\[annotation:([\w-]+)\]\]([\s\S]*?)\[\[\/annotation\]\]/g, (_match, id: string, body: string) => {
    blockAnnotations.set(id.trim(), body.trim());
    return '';
  });

  const annotations: { id: string; label: string; bodyHtml: string }[] = [];
  const emitted = new Map<string, string>();
  let annotationNumber = 0;
  const withRefs = withoutBlocks.replace(/\[\[note:\s*([\s\S]*?)\]\]|\[\[@([\w-]+)\]\]/g, (_match, note: string | undefined, id: string | undefined) => {
    if (typeof note === 'string') {
      annotationNumber += 1;
      const noteId = `note-${annotationNumber}`;
      annotations.push({ id: noteId, label: String(annotationNumber), bodyHtml: enhanceMarkdownHtml(marked.parse(note.trim()) as string) });
      return `<sup class="canvas-annotation-ref" id="annotation-ref-${noteId}" data-annotation-ref="${noteId}"><a href="#annotation-${noteId}">${annotationNumber}</a></sup>`;
    }

    const trimmedId = (id ?? '').trim();
    const existingLabel = emitted.get(trimmedId);
    if (existingLabel) {
      return `<sup class="canvas-annotation-ref" id="annotation-ref-${trimmedId}-${existingLabel}" data-annotation-ref="${trimmedId}"><a href="#annotation-${trimmedId}">${existingLabel}</a></sup>`;
    }

    annotationNumber += 1;
    const label = String(annotationNumber);
    emitted.set(trimmedId, label);
    const body = blockAnnotations.get(trimmedId) ?? '';
    annotations.push({ id: trimmedId, label, bodyHtml: body ? enhanceMarkdownHtml(marked.parse(body) as string) : FALLBACK_TEXT });
    return `<sup class="canvas-annotation-ref" id="annotation-ref-${trimmedId}" data-annotation-ref="${trimmedId}"><a href="#annotation-${trimmedId}">${label}</a></sup>`;
  });

  const rendered = renderMarkdownWithHeadingIds(withRefs);
  return { ...rendered, annotations };
}

function renderPaneMarkdown(raw: string): string {
  return renderMarkdownWithHeadingIds(raw).bodyHtml;
}

function resolvePaneFile(postDir: string, paneConfig: RawPostPaneConfig): string {
  const paneFile = path.resolve(postDir, paneConfig.file || `${paneConfig.id}.md`);
  const relative = path.relative(postDir, paneFile);
  if (!(relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)))) {
    throw new Error(`Pane file must stay within post directory: ${paneConfig.file}`);
  }
  if (fs.existsSync(paneFile)) {
    const realPostDir = fs.realpathSync(postDir);
    const realPaneFile = fs.realpathSync(paneFile);
    const realRelative = path.relative(realPostDir, realPaneFile);
    if (realRelative.startsWith(`..${path.sep}`) || realRelative === '..' || path.isAbsolute(realRelative)) {
      throw new Error(`Pane file symlink must stay within post directory: ${paneConfig.file}`);
    }
  }
  return paneFile;
}

function createPane(postDir: string, paneConfig: RawPostPaneConfig): PostPane {
  const paneFile = resolvePaneFile(postDir, paneConfig);
  if (!fs.existsSync(paneFile)) {
    return {
      id: paneConfig.id,
      title: paneConfig.title || paneConfig.id,
      file: paneFile,
      rawContent: '',
      bodyHtml: FALLBACK_TEXT,
      missing: true,
    };
  }

  const rawContent = fs.readFileSync(paneFile, 'utf8');
  const rendered = paneConfig.id === 'canvas'
    ? renderCanvasMarkdown(rawContent)
    : { bodyHtml: renderPaneMarkdown(rawContent) };

  return {
    id: paneConfig.id,
    title: paneConfig.title || paneConfig.id,
    file: paneFile,
    rawContent,
    bodyHtml: rendered.bodyHtml,
    missing: false,
  };
}

function createGeneratedPane(paneConfig: RawPostPaneConfig, sourcePane: PostPane): PostPane {
  const rendered = renderCanvasMarkdown(sourcePane.rawContent);
  const id = paneConfig.id;
  const title = paneConfig.title || id;
  const bodyHtml = paneConfig.generated === 'annotations'
    ? rendered.annotations.map((annotation) => `
      <section class="canvas-annotation" id="annotation-${annotation.id}" data-annotation-id="${annotation.id}">
        <a class="canvas-annotation__label" href="#annotation-ref-${annotation.id}">${annotation.label}</a>
        <div class="canvas-annotation__body">${annotation.bodyHtml}</div>
      </section>
    `).join('') || '<p><em>No annotations.</em></p>'
    : `<nav class="canvas-index">${rendered.headings.map((heading) => `
      <a class="canvas-index__item canvas-index__item--depth-${heading.depth}" href="#${heading.id}" data-index-ref="${heading.id}">${escapeHtml(heading.text)}</a>
    `).join('')}</nav>`;

  return {
    id,
    title,
    file: sourcePane.file,
    rawContent: '',
    bodyHtml,
    missing: false,
  };
}

function resolvePaneLayout(_paneIds: string[], _layout?: RawPostLayoutConfig): PostLayout {
  return {
    columns: '11rem minmax(0, 1fr) 15rem',
    rows: '1fr',
    areas: [['index', 'canvas', 'annotations']],
  };
}

function readPostConfig(postDir: string): RawPostConfig {
  const configPath = path.join(postDir, 'post.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  let config: unknown;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${configPath}: ${message}`);
  }
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error(`Invalid post config in ${configPath}: expected an object`);
  }
  const value = config as Record<string, unknown>;
  const allowed = new Set(['title', 'date', 'slug', 'panes', 'layout']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Invalid post config in ${configPath}: unknown key ${key}`);
  }
  for (const key of ['title', 'slug']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw new Error(`Invalid post config in ${configPath}: ${key} must be a string`);
  }
  if (value.date !== undefined && typeof value.date !== 'string' && typeof value.date !== 'number') {
    throw new Error(`Invalid post config in ${configPath}: date must be a string or number`);
  }
  if (value.layout !== undefined) {
    const layout = value.layout;
    if (typeof layout !== 'object' || layout === null || Array.isArray(layout) || Object.keys(layout).some((key) => key !== 'preset') || (layout as Record<string, unknown>).preset !== 'canvas') {
      throw new Error(`Invalid post config in ${configPath}: layout must be { "preset": "canvas" }`);
    }
  }
  if (value.panes !== undefined) {
    if (!Array.isArray(value.panes) || value.panes.length !== 3) throw new Error(`Invalid post config in ${configPath}: panes must declare index, canvas, and annotations`);
    const ids = value.panes.map((pane) => typeof pane === 'object' && pane !== null ? (pane as Record<string, unknown>).id : '');
    if (new Set(ids).size !== 3 || !['index', 'canvas', 'annotations'].every((id) => ids.includes(id))) {
      throw new Error(`Invalid post config in ${configPath}: panes must declare index, canvas, and annotations`);
    }
  }
  return value as RawPostConfig;
}

function toPostObject(
  source: string,
  metadataTitle: string,
  authoredDate: Date | undefined,
  config?: RawPostConfig,
): Post {
  const panesConfig = normalizePaneConfig(config?.panes);

  const fileSource = path.join(source, 'post.json');
  const configSource = config ? fileSource : source;

  const loadedPanes = panesConfig
    .filter((paneConfig) => !paneConfig.generated)
    .map((paneConfig) => createPane(source, paneConfig));
  const panes = panesConfig.map((paneConfig) => {
    if (!paneConfig.generated) {
      return loadedPanes.find((pane) => pane.id === paneConfig.id) ?? createPane(source, paneConfig);
    }

    const sourceId = paneConfig.source ?? 'canvas';
    const sourcePane = loadedPanes.find((pane) => pane.id === sourceId) ?? loadedPanes[0];
    return sourcePane ? createGeneratedPane(paneConfig, sourcePane) : createPane(source, paneConfig);
  });

  const metadataSlugSource = config?.slug ?? metadataTitle;
  const slug = derivePostSlug(metadataSlugSource, configSource);

  const layout = resolvePaneLayout(panes.map((pane) => String(pane.id)), config?.layout);

  const primaryPane = panes.find((pane) => pane.id === 'canvas') ?? panes[0];

  const date = buildUnstatedDate(authoredDate);

  return {
    metadata: {
      title: metadataTitle,
      date,
      isoDate: date.toISOString(),
      createdAt: date,
      updatedAt: date,
      contentHash: '',
      shortHash: '',
      authoredDate,
      slug,
      source,
    },
    bodyHtml: primaryPane?.bodyHtml ?? '',
    rawContent: primaryPane?.rawContent ?? '',
    panes,
    layout,
  };
}

export function loadPost(filePath: string): Post {
  if (!fs.statSync(filePath).isDirectory()) {
    throw new Error(`Posts must be canvas directories with post.json and canvas.md: ${filePath}`);
  }

  const config = readPostConfig(filePath);
  const canvasPath = path.join(filePath, 'canvas.md');
  if (!fs.existsSync(canvasPath) || !fs.statSync(canvasPath).isFile()) {
    throw new Error(`Canvas post is missing canvas.md: ${filePath}`);
  }
  const configTitle = typeof config.title === 'string' && config.title.trim().length > 0
    ? config.title.trim()
    : inferTitleFromPath(filePath);
  const configDate = parseOptionalDate(config.date, path.join(filePath, 'post.json'));
  const post = toPostObject(filePath, configTitle, configDate, config);
  return post;
}

export function collectPostSources(postsDir: string): string[] {
  const entries = fs.readdirSync(postsDir, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const full = path.join(postsDir, entry.name);

    if (entry.isDirectory()) {
      const postConfigPath = path.join(full, 'post.json');
      if (fs.existsSync(postConfigPath)) {
        paths.push(full);
        continue;
      }

      paths.push(...collectPostSources(full));
      continue;
    }

  }

  return paths;
}

export function collectMarkdownFiles(postsDir: string): string[] {
  const entries = fs.readdirSync(postsDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(postsDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(full));
      continue;
    }

    if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
      files.push(full);
    }
  }

  return files;
}

export function createWorkAreaStyle(layout: PostLayout): string {
  const sanitizedRows = layout.rows || '1fr';
  const sanitizedColumns = layout.columns || `repeat(${Math.max(1, layout.areas[0]?.length || 1)}, 1fr)`;
  const areaLines = layout.areas
    .filter((row) => row.length > 0)
    .map((row) => row.map((cell) => (cell ? cell : '.')).join(' '))
    .map((row) => `"${row}"`)
    .join(' ');

  return `grid-template-columns: ${sanitizedColumns}; grid-template-rows: ${sanitizedRows}; grid-template-areas: ${areaLines};`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function collectPaneIdsFromLayout(layout: PostLayout): string[] {
  const ids = new Set<string>();
  for (const row of layout.areas) {
    for (const cell of row) {
      if (cell && cell !== '.') {
        ids.add(cell);
      }
    }
  }

  return [...ids];
}
