import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Post } from '../types';

export interface PostStateEntry {
  createdAt: string;
  updatedAt: string;
  contentHash: string;
}

export interface SsgState {
  version: 1;
  posts: Record<string, PostStateEntry>;
}

export function getStatePath(sourceDir: string): string {
  return path.join(sourceDir, '.ssg', 'state.json');
}

export function readState(statePath: string): SsgState {
  if (!fs.existsSync(statePath)) {
    return { version: 1, posts: {} };
  }

  const raw = fs.readFileSync(statePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<SsgState>;
  return {
    version: 1,
    posts: parsed.posts ?? {},
  };
}

export function writeState(statePath: string, state: SsgState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function listAuthoredFiles(source: string): string[] {
  if (!fs.statSync(source).isDirectory()) {
    return [source];
  }

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      if (entry.isFile() && /\.(md|mdx|json)$/i.test(entry.name)) {
        files.push(full);
      }
    }
  };

  walk(source);
  return files.sort();
}

export function computePostContentHash(post: Post): string {
  const hash = crypto.createHash('sha256');
  const files = listAuthoredFiles(post.metadata.source);

  for (const file of files) {
    hash.update(path.relative(post.metadata.source, file));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }

  return hash.digest('hex');
}

export function applyPostState(posts: Post[], statePath: string, now = new Date()): SsgState {
  const state = readState(statePath);
  const nextPosts: Record<string, PostStateEntry> = { ...state.posts };
  const nowIso = now.toISOString();

  for (const post of posts) {
    const slug = post.metadata.slug;
    const contentHash = computePostContentHash(post);
    const prior = state.posts[slug];
    const fallbackCreatedAt = post.metadata.authoredDate?.toISOString() ?? nowIso;

    const entry: PostStateEntry = prior
      ? {
          createdAt: prior.createdAt,
          updatedAt: prior.contentHash === contentHash ? prior.updatedAt : nowIso,
          contentHash,
        }
      : {
          createdAt: fallbackCreatedAt,
          updatedAt: fallbackCreatedAt,
          contentHash,
        };

    nextPosts[slug] = entry;
    const createdAt = new Date(entry.createdAt);
    const updatedAt = new Date(entry.updatedAt);
    post.metadata.createdAt = createdAt;
    post.metadata.updatedAt = updatedAt;
    post.metadata.date = createdAt;
    post.metadata.isoDate = createdAt.toISOString();
    post.metadata.contentHash = contentHash;
    post.metadata.shortHash = contentHash.slice(0, 12);
  }

  const nextState: SsgState = { version: 1, posts: nextPosts };
  writeState(statePath, nextState);
  return nextState;
}
