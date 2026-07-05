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

function writeCanvasPost(root: string, body: string): string {
  const postDir = path.join(root, 'content', 'posts', 'hello');
  writeFile(path.join(postDir, 'post.json'), JSON.stringify({ title: 'Hello', layout: { preset: 'canvas' } }, null, 2));
  writeFile(path.join(postDir, 'canvas.md'), body);
  return postDir;
}

describe('SSG post state', () => {
  it('creates state for a new post and applies metadata', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-state-'));
    const postDir = writeCanvasPost(tmp, '# Hello\n\nFirst version.');

    try {
      const post = loadPost(postDir);
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
    const postDir = writeCanvasPost(tmp, '# Hello\n\nSame version.');

    try {
      const statePath = getStatePath(tmp);
      applyPostState([loadPost(postDir)], statePath, new Date('2026-07-03T10:00:00.000Z'));
      applyPostState([loadPost(postDir)], statePath, new Date('2026-07-04T10:00:00.000Z'));

      const state = readState(statePath);
      expect(state.posts.hello.createdAt).toBe('2026-07-03T10:00:00.000Z');
      expect(state.posts.hello.updatedAt).toBe('2026-07-03T10:00:00.000Z');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('updates updatedAt and hash when content changes', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-state-'));
    const postDir = writeCanvasPost(tmp, '# Hello\n\nFirst version.');

    try {
      const statePath = getStatePath(tmp);
      applyPostState([loadPost(postDir)], statePath, new Date('2026-07-03T10:00:00.000Z'));
      const firstHash = readState(statePath).posts.hello.contentHash;

      writeFile(path.join(postDir, 'canvas.md'), '# Hello\n\nSecond version.');
      applyPostState([loadPost(postDir)], statePath, new Date('2026-07-04T10:00:00.000Z'));

      const state = readState(statePath);
      expect(state.posts.hello.createdAt).toBe('2026-07-03T10:00:00.000Z');
      expect(state.posts.hello.updatedAt).toBe('2026-07-04T10:00:00.000Z');
      expect(state.posts.hello.contentHash).not.toBe(firstHash);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
