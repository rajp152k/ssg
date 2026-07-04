import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadPost } from '../src/lib/post';
import { applyPostState, getStatePath, readState } from '../src/lib/state';

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('SSG post state', () => {
  it('creates state for a new post and applies metadata', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-state-'));
    const postPath = path.join(tmp, 'content', 'posts', 'hello.md');
    writeFile(postPath, '---\ntitle: Hello\n---\n\nFirst version.');

    try {
      const post = loadPost(postPath);
      const statePath = getStatePath(tmp);
      applyPostState([post], statePath, new Date('2026-07-03T10:00:00.000Z'));

      const state = readState(statePath);
      expect(state.posts.hello.createdAt).toBe('2026-07-03T10:00:00.000Z');
      expect(state.posts.hello.updatedAt).toBe('2026-07-03T10:00:00.000Z');
      expect(state.posts.hello.contentHash).toHaveLength(64);
      expect(post.metadata.shortHash).toHaveLength(12);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('preserves timestamps when content is unchanged', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-state-'));
    const postPath = path.join(tmp, 'content', 'posts', 'hello.md');
    writeFile(postPath, '---\ntitle: Hello\n---\n\nSame version.');

    try {
      const statePath = getStatePath(tmp);
      applyPostState([loadPost(postPath)], statePath, new Date('2026-07-03T10:00:00.000Z'));
      applyPostState([loadPost(postPath)], statePath, new Date('2026-07-04T10:00:00.000Z'));

      const state = readState(statePath);
      expect(state.posts.hello.createdAt).toBe('2026-07-03T10:00:00.000Z');
      expect(state.posts.hello.updatedAt).toBe('2026-07-03T10:00:00.000Z');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('updates updatedAt and hash when content changes', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-state-'));
    const postPath = path.join(tmp, 'content', 'posts', 'hello.md');
    writeFile(postPath, '---\ntitle: Hello\n---\n\nFirst version.');

    try {
      const statePath = getStatePath(tmp);
      applyPostState([loadPost(postPath)], statePath, new Date('2026-07-03T10:00:00.000Z'));
      const firstHash = readState(statePath).posts.hello.contentHash;

      writeFile(postPath, '---\ntitle: Hello\n---\n\nSecond version.');
      applyPostState([loadPost(postPath)], statePath, new Date('2026-07-04T10:00:00.000Z'));

      const state = readState(statePath);
      expect(state.posts.hello.createdAt).toBe('2026-07-03T10:00:00.000Z');
      expect(state.posts.hello.updatedAt).toBe('2026-07-04T10:00:00.000Z');
      expect(state.posts.hello.contentHash).not.toBe(firstHash);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
