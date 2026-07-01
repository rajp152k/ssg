import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { collectMarkdownFiles, loadPost } from '../src/lib/post';

function createTempFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('post parsing', () => {
  it('loads markdown with required date and returns html', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const file = path.join(tmp, 'welcome.md');

    createTempFile(
      file,
      `---
title: Test Post
date: 2026-07-02
---

This is **markdown**.`,
    );

    try {
      const post = loadPost(file);
      expect(post.metadata.title).toBe('Test Post');
      expect(post.metadata.isoDate).toBe('2026-07-02T00:00:00.000Z');
      expect(post.metadata.slug).toBe('test-post');
      expect(post.bodyHtml).toContain('<p>This is <strong>markdown</strong>.</p>');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('infers title from filename when title is not present', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const file = path.join(tmp, 'hello-from-filename.md');

    createTempFile(
      file,
      `---
date: 2026-07-02
---

From filename title.`,
    );

    try {
      const post = loadPost(file);
      expect(post.metadata.title).toBe('Hello From Filename');
      expect(post.metadata.slug).toBe('hello-from-filename');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('throws if required date is missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const file = path.join(tmp, 'missing-date.md');

    createTempFile(file, '---\ntitle: No Date\n---\n\nOops.');

    try {
      expect(() => loadPost(file)).toThrow("Missing required frontmatter 'date'");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('collects markdown files recursively', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const nested = path.join(tmp, 'nested', 'entry.md');

    createTempFile(
      path.join(tmp, 'root.md'),
      '---\ntitle: Root\ndate: 2026-07-02\n---\nRoot',
    );
    createTempFile(
      nested,
      '---\ntitle: Nested\ndate: 2026-07-02\n---\nNested',
    );

    createTempFile(path.join(tmp, 'notes.txt'), 'ignore me');

    try {
      const files = collectMarkdownFiles(tmp);
      expect(files).toHaveLength(2);
      expect(files).toEqual(expect.arrayContaining([path.join(tmp, 'root.md'), nested]));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
