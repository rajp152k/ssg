import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { collectMarkdownFiles, collectPostSources, loadPost } from '../src/lib/post';

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
      expect(() => loadPost(file)).toThrow('Missing required date');
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

  it('loads a post directory configured with human/agent/abstract/view', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const postDir = path.join(tmp, 'coauthoring-post');

    fs.mkdirSync(postDir, { recursive: true });
    fs.mkdirSync(path.join(postDir, 'assets'), { recursive: true });

    const config = {
      title: 'Co-Authoring Trial',
      date: '2026-07-02',
      panes: [
        { id: 'human', file: 'human.md', title: 'Human notes' },
        { id: 'agent', file: 'agent.md', title: 'Agent draft' },
        { id: 'abstract', file: 'abstract.md', title: 'Math notes' },
        { id: 'view', file: 'view.md', title: 'Visualizations' },
      ],
      layout: {
        preset: '1x3+1',
      },
      sync: {
        enabled: true,
        source: 'human',
      },
    };

    fs.writeFileSync(path.join(postDir, 'post.json'), JSON.stringify(config, null, 2), 'utf8');
    createTempFile(path.join(postDir, 'human.md'), '# Human\n\nThe main idea.');
    createTempFile(path.join(postDir, 'agent.md'), '# Agent\n\nGenerated output.');
    createTempFile(path.join(postDir, 'abstract.md'), '# Abstract\n\nMathematical framing.');
    createTempFile(path.join(postDir, 'view.md'), '```mermaid\ngraph TD\nA-->B\n```');

    try {
      const post = loadPost(postDir);
      expect(post.metadata.title).toBe('Co-Authoring Trial');
      expect(post.panes.map((pane) => pane.id)).toEqual(['human', 'agent', 'abstract', 'view']);
      expect(post.layout.areas).toHaveLength(2);
      expect(post.panes[1].bodyHtml).toContain('Generated output');
      expect(post.panes[3].bodyHtml).toContain('<pre class="mermaid">');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('collects post directories as build entries', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const postDir = path.join(tmp, 'post-dir');
    fs.mkdirSync(postDir, { recursive: true });

    fs.mkdirSync(path.join(tmp, 'nested')); 

    const config = {
      title: 'Directory Post',
      date: '2026-07-02',
    };

    fs.writeFileSync(path.join(postDir, 'post.json'), JSON.stringify(config, null, 2), 'utf8');
    createTempFile(path.join(postDir, 'human.md'), '# Human content');

    createTempFile(
      path.join(tmp, 'nested', 'md-post.md'),
      '---\ntitle: Nested\ndate: 2026-07-02\n---\nNested file',
    );

    try {
      const postSources = collectPostSources(tmp);
      expect(postSources).toHaveLength(2);
      expect(postSources).toEqual(expect.arrayContaining([postDir, path.join(tmp, 'nested', 'md-post.md')]));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
