import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import type { Post, PostMetadata, RawPostFrontmatter } from '../types';
import { derivePostSlug } from './slug';

export function loadPost(filePath: string): Post {
  const source = fs.readFileSync(filePath, 'utf8');
  const parsed = matter(source);
  const frontmatter = (parsed.data || {}) as RawPostFrontmatter;

  const title = typeof frontmatter.title === 'string' && frontmatter.title.trim().length > 0
    ? frontmatter.title.trim()
    : inferTitleFromPath(filePath);

  const date = parseDate(frontmatter.date, filePath);

  const slug = typeof frontmatter.slug === 'string' && frontmatter.slug.trim().length > 0
    ? derivePostSlug(frontmatter.slug, filePath)
    : derivePostSlug(title, filePath);

  const metadata: PostMetadata = {
    title,
    date,
    isoDate: date.toISOString(),
    slug,
    source: filePath,
  };

  const bodyHtml = marked.parse(parsed.content);

  return {
    metadata,
    bodyHtml: bodyHtml as string,
    rawContent: parsed.content,
  };
}

function parseDate(value: string | number | undefined, sourcePath: string): Date {
  if (typeof value === 'undefined') {
    throw new Error(`Missing required frontmatter 'date' in ${sourcePath}`);
  }

  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid frontmatter 'date' value in ${sourcePath}: ${String(value)}`);
  }

  return date;
}

function inferTitleFromPath(filePath: string): string {
  const fileName = path.basename(filePath).replace(/\.(md|mdx)$/i, '');
  return fileName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
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
