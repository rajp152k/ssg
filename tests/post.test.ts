import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { collectMarkdownFiles, collectPostSources, extractHeadingSignatures, loadPost } from '../src/lib/post';

function createTempFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createCanvasPost(root: string, title: string, body: string, slug = title.toLowerCase().replace(/\s+/g, '-')): string {
  const postDir = path.join(root, slug);
  fs.mkdirSync(postDir, { recursive: true });
  createTempFile(
    path.join(postDir, 'post.json'),
    JSON.stringify(
      {
        title,
        panes: [
          { id: 'index', title: 'Index', generated: 'index', source: 'canvas' },
          { id: 'canvas', title: 'Canvas', file: 'canvas.md' },
          { id: 'annotations', title: 'Annotations', generated: 'annotations', source: 'canvas' },
        ],
        layout: { preset: 'canvas' },
      },
      null,
      2,
    ),
  );
  createTempFile(path.join(postDir, 'canvas.md'), body);
  return postDir;
}

describe('post parsing', () => {
  it('loads a canvas directory post and returns html', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const postDir = createCanvasPost(tmp, 'Test Post', '# Test Post\n\nThis is **markdown**.');

    try {
      const post = loadPost(postDir);
      expect(post.metadata.title).toBe('Test Post');
      expect(post.metadata.slug).toBe('test-post');
      expect(post.panes.map((pane) => pane.id)).toEqual(['index', 'canvas', 'annotations']);
      expect(post.bodyHtml).toContain('<p>This is <strong>markdown</strong>.</p>');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects legacy single-file markdown posts', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const file = path.join(tmp, 'legacy.md');
    createTempFile(file, '---\ntitle: Legacy\n---\n\nLegacy body.');

    try {
      expect(() => loadPost(file)).toThrow('Posts must be canvas directories');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects pane files outside the post directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const postDir = createCanvasPost(tmp, 'Unsafe Post', '# Unsafe');
    createTempFile(path.join(tmp, 'outside.md'), '# Private');
    createTempFile(path.join(postDir, 'post.json'), JSON.stringify({
      title: 'Unsafe Post',
      panes: [
        { id: 'index', generated: 'index', source: 'canvas' },
        { id: 'canvas', file: '../outside.md' },
        { id: 'annotations', generated: 'annotations', source: 'canvas' },
      ],
      layout: { preset: 'canvas' },
    }));

    try {
      expect(() => loadPost(postDir)).toThrow('Pane file must stay within post directory');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('collects markdown files recursively for tooling helpers', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const nested = path.join(tmp, 'nested', 'entry.md');

    createTempFile(path.join(tmp, 'root.md'), '# Root');
    createTempFile(nested, '# Nested');
    createTempFile(path.join(tmp, 'notes.txt'), 'ignore me');

    try {
      const files = collectMarkdownFiles(tmp);
      expect(files).toHaveLength(2);
      expect(files).toEqual(expect.arrayContaining([path.join(tmp, 'root.md'), nested]));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('collects canvas post directories as build entries', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const postDir = createCanvasPost(tmp, 'Directory Post', '# Directory Post');
    createTempFile(path.join(tmp, 'nested', 'legacy.md'), '# ignored legacy file');

    try {
      const postSources = collectPostSources(tmp);
      expect(postSources).toEqual([postDir]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('renders markdown niceties for mermaid, code, math, and captioned images', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const postDir = createCanvasPost(
      tmp,
      'Niceties',
      '# Niceties\n\n```mermaid\n%% caption: A small flow diagram\ngraph TD\n  A-->B\n```\n\n```ts\nconst x = 1;\n```\n\nInline math $x^2$.\n\n![System diagram](diagram.png "A boxed diagram")',
    );

    try {
      const post = loadPost(postDir);
      expect(post.bodyHtml).toContain('<figure class="ssg-diagram">');
      expect(post.bodyHtml).toContain('<pre class="mermaid">graph TD');
      expect(post.bodyHtml).toContain('<figcaption>A small flow diagram</figcaption>');
      expect(post.bodyHtml).toContain('<code class="language-ts">');
      expect(post.bodyHtml).toContain('$x^2$');
      expect(post.bodyHtml).toContain('<figure class="ssg-image">');
      expect(post.bodyHtml).toContain('<figcaption>A boxed diagram</figcaption>');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('extracts and normalizes heading signatures from markdown', () => {
    const signatures = extractHeadingSignatures(
      '# Canvas Notes\n\n## Problem statement\n### A heading with *emphasis*\n\n',
    );

    expect(signatures).toEqual([
      '1:canvas notes',
      '2:problem statement',
      '3:a heading with emphasis',
    ]);
  });
});
