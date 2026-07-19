import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import type { Meditation } from '../types';
import { slugify } from './slug';

interface MeditationFrontMatter {
  title: string;
  date: string;
}

function parseFrontMatter(source: string, filePath: string): { metadata: MeditationFrontMatter; body: string } {
  const normalized = source.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) {
    throw new Error(`Meditation must start with --- front matter: ${filePath}`);
  }

  const values: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`Invalid meditation front matter in ${filePath}: ${line}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!['title', 'date'].includes(key)) throw new Error(`Unknown meditation front matter key in ${filePath}: ${key}`);
    if (key in values) throw new Error(`Duplicate meditation front matter key in ${filePath}: ${key}`);
    values[key] = value;
  }

  if (!values.title) throw new Error(`Meditation title is required: ${filePath}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date ?? '')) {
    throw new Error(`Meditation date must use YYYY-MM-DD: ${filePath}`);
  }
  const date = new Date(`${values.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== values.date) {
    throw new Error(`Meditation date is invalid: ${filePath}`);
  }

  return {
    metadata: { title: values.title, date: values.date },
    body: match[2].trim(),
  };
}

export function loadMeditation(filePath: string): Meditation {
  const source = fs.readFileSync(filePath, 'utf8');
  const { metadata, body } = parseFrontMatter(source, filePath);
  const slug = slugify(path.basename(filePath, path.extname(filePath)));
  if (!slug || slug === 'page') throw new Error(`Invalid or reserved meditation filename: ${filePath}`);

  return {
    title: metadata.title,
    date: new Date(`${metadata.date}T00:00:00.000Z`),
    slug,
    source: filePath,
    bodyHtml: marked.parse(body) as string,
    rawContent: body,
  };
}

export function collectMeditationSources(meditationsDir: string): string[] {
  if (!fs.existsSync(meditationsDir)) return [];
  return fs.readdirSync(meditationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
    .map((entry) => path.join(meditationsDir, entry.name))
    .sort();
}
