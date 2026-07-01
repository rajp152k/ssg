import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import type {
  Post,
  PostLayout,
  PostPane,
  PostPaneId,
  RawPostConfig,
  RawPostFrontmatter,
  RawPostLayoutConfig,
  RawPostPaneConfig,
} from '../types';
import { derivePostSlug } from './slug';

const defaultPaneDefinitions: RawPostPaneConfig[] = [
  { id: 'human', title: '{{author}}', file: 'human.md' },
  { id: 'agent', title: '{{assistant}}', file: 'agent.md' },
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

function parseDate(value: string | number | undefined, sourcePath: string): Date {
  if (typeof value === 'undefined') {
    throw new Error(`Missing required date in ${sourcePath}`);
  }

  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value in ${sourcePath}: ${String(value)}`);
  }

  return date;
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

  const configured = new Map<string, RawPostPaneConfig>();

  for (const pane of panes) {
    if (!pane || typeof pane.id !== 'string') {
      continue;
    }

    const id = pane.id.trim();
    if (!id || used.has(id)) {
      continue;
    }

    if (id !== 'human' && id !== 'agent') {
      continue;
    }

    used.add(id);
    configured.set(id, {
      id,
      title: pane.title?.trim() || id,
      file: pane.file ?? `${id}.md`,
    });
  }

  return [
    configured.get('human') ?? { id: 'human', title: '{{author}}', file: 'human.md' },
    configured.get('agent') ?? { id: 'agent', title: '{{assistant}}', file: 'agent.md' },
  ];
}

function applyAgentSessionSyntax(markdown: string): string {
  const sessionRegex = /<!--agent-session(?:\s+([^>]*)?)?-->([\s\S]*?)<!--\/agent-session-->/g;
  if (!sessionRegex.test(markdown)) {
    return markdown;
  }

  sessionRegex.lastIndex = 0;

  let output = '';
  let lastIndex = 0;

  for (const match of markdown.matchAll(sessionRegex)) {
    const [block, attrText, sessionBody] = match;

    const prelude = markdown.slice(lastIndex, match.index ?? 0);
    output += prelude;

    const titleMatch = /title\s*=\s*"([^"]*)"/.exec(attrText ?? '');
    const title = titleMatch?.[1] ?? 'Session';
    const sessionTitle = escapeHtml(title);

    const body = marked.parse(sessionBody) as string;
    output += `<div class="agent-session"><h4>${sessionTitle}</h4>${body}</div>`;
    lastIndex = (match.index ?? 0) + block.length;
  }

  output += markdown.slice(lastIndex);
  return output;
}

function renderPaneMarkdown(raw: string, paneId: PostPaneId): string {
  const withSessions = paneId === 'agent' ? applyAgentSessionSyntax(raw) : raw;
  return marked.parse(withSessions) as string;
}

function createPane(postDir: string, paneConfig: RawPostPaneConfig): PostPane {
  const paneFile = path.resolve(postDir, paneConfig.file || `${paneConfig.id}.md`);
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
  const bodyHtml = renderPaneMarkdown(rawContent, paneConfig.id);

  return {
    id: paneConfig.id,
    title: paneConfig.title || paneConfig.id,
    file: paneFile,
    rawContent,
    bodyHtml,
    missing: false,
  };
}

function resolvePaneLayout(paneIds: string[], layout?: RawPostLayoutConfig): PostLayout {
  const fallbackColumns = `repeat(${Math.min(paneIds.length, 3)}, 1fr)`;
  const fallbackRows = '1fr';

  if (!layout) {
    return buildDefaultLayout(paneIds);
  }

  if (layout.preset) {
    return buildPresetLayout(layout.preset, paneIds);
  }

  if (layout.columns && layout.rows && Array.isArray(layout.areas) && layout.areas.length > 0) {
    const normalizedAreas = layout.areas.map((row) => row.map((cell) => (paneIds.includes(cell) ? cell : '.')));
    return {
      columns: layout.columns,
      rows: layout.rows,
      areas: normalizedAreas,
    };
  }

  if (layout.columns && !layout.rows && !layout.areas) {
    return {
      columns: layout.columns,
      rows: fallbackRows,
      areas: [paneIds],
    };
  }

  if (layout.rows && !layout.columns && !layout.areas) {
    return {
      columns: fallbackColumns,
      rows: layout.rows,
      areas: [paneIds],
    };
  }

  return buildDefaultLayout(paneIds);
}

function buildDefaultLayout(paneIds: string[]): PostLayout {
  const normalized = paneIds.map((id) => id.trim()).filter(Boolean);
  const count = normalized.length;

  if (count <= 1) {
    return {
      columns: '1fr',
      rows: '1fr',
      areas: [[normalized[0] || 'human']],
    };
  }

  if (count === 2) {
    return {
      columns: '1fr 1fr',
      rows: '1fr',
      areas: [[normalized[0], normalized[1]]],
    };
  }

  if (count === 3) {
    return {
      columns: '1fr 1fr 1fr',
      rows: '1fr',
      areas: [[normalized[0], normalized[1], normalized[2]]],
    };
  }

  return {
    columns: '2fr 1fr 1fr',
    rows: '1fr 1fr',
    areas: [
      [normalized[0], normalized[1], normalized[2]],
      [normalized[3] || normalized[2], normalized[3] || normalized[2], normalized[3] || normalized[2]],
    ],
  };
}

function buildPresetLayout(preset: '2x1' | '1x2', paneIds: string[]): PostLayout {
  const normalized = paneIds.map((id) => id.trim()).filter(Boolean);
  const first = normalized[0] ?? 'human';
  const second = normalized[1] ?? 'agent';

  if (preset === '2x1') {
    return {
      columns: '2fr 1fr',
      rows: '1fr',
      areas: [[first, second]],
    };
  }

  return {
    columns: '1fr 1fr',
    rows: '1fr',
    areas: [[first, second]],
  };
}

function readPostConfig(postDir: string): RawPostConfig {
  const configPath = path.join(postDir, 'post.json');
  const raw = fs.readFileSync(configPath, 'utf8');

  try {
    return JSON.parse(raw) as RawPostConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${configPath}: ${message}`);
  }
}

function toPostObject(
  source: string,
  metadataTitle: string,
  date: Date,
  config?: RawPostConfig,
): Post {
  const panesConfig = normalizePaneConfig(config?.panes);

  const fileSource = path.join(source, 'post.json');
  const configSource = config ? fileSource : source;

  const panes = panesConfig.map((paneConfig) => createPane(source, paneConfig));

  const metadataSlugSource = config?.slug ?? metadataTitle;
  const slug = derivePostSlug(metadataSlugSource, configSource);

  const layout = resolvePaneLayout(panes.map((pane) => String(pane.id)), config?.layout);

  const primaryPane = panes.find((pane) => pane.id === 'human') ?? panes[0];

  return {
    metadata: {
      title: metadataTitle,
      date,
      isoDate: date.toISOString(),
      slug,
      source,
    },
    bodyHtml: primaryPane?.bodyHtml ?? '',
    rawContent: primaryPane?.rawContent ?? '',
    panes,
    layout,
    sync: {
      enabled: config?.sync?.enabled ?? true,
      source: config?.sync?.source ?? 'human',
    },
  };
}

export function loadPost(filePath: string): Post {
  if (!fs.statSync(filePath).isDirectory()) {
    const source = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(source);
    const frontmatter = (parsed.data || {}) as RawPostFrontmatter;

    const title = typeof frontmatter.title === 'string' && frontmatter.title.trim().length > 0
      ? frontmatter.title.trim()
      : inferTitleFromPath(filePath);
    const date = parseDate(frontmatter.date, filePath);
    const metadataSlug = typeof frontmatter.slug === 'string' && frontmatter.slug.trim().length > 0
      ? frontmatter.slug
      : title;

    const slug = derivePostSlug(metadataSlug, filePath);
    const rawContent = parsed.content;
    const bodyHtml = marked.parse(rawContent) as string;

    return {
      metadata: {
        title,
        date,
        isoDate: date.toISOString(),
        slug,
        source: filePath,
      },
      bodyHtml,
      rawContent,
      panes: [
        {
          id: 'human',
          title: 'Content',
          file: filePath,
          rawContent,
          bodyHtml,
          missing: false,
        },
      ],
      layout: {
        columns: '1fr',
        rows: '1fr',
        areas: [['human']],
      },
      sync: {
        enabled: true,
        source: 'human',
      },
    };
  }

  const config = readPostConfig(filePath);
  const configTitle = typeof config.title === 'string' && config.title.trim().length > 0
    ? config.title.trim()
    : inferTitleFromPath(filePath);
  const configDate = parseDate(config.date, path.join(filePath, 'post.json'));
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

    if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
      paths.push(full);
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
