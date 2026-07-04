import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { collectMarkdownFiles, collectPostSources, extractHeadingSignatures, loadPost } from '../src/lib/post';

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

  it('loads posts without authored date metadata', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const file = path.join(tmp, 'missing-date.md');

    createTempFile(file, '---\ntitle: No Date\n---\n\nOops.');

    try {
      const post = loadPost(file);
      expect(post.metadata.title).toBe('No Date');
      expect(post.metadata.authoredDate).toBeUndefined();
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

  it('loads a post directory configured with human and agent', () => {
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
      ],
      layout: {
        preset: '1x2',
      },
      sync: {
        enabled: true,
        source: 'human',
      },
    };

    fs.writeFileSync(path.join(postDir, 'post.json'), JSON.stringify(config, null, 2), 'utf8');
    createTempFile(path.join(postDir, 'human.md'), '# Human\n\nThe main idea.');
    createTempFile(path.join(postDir, 'agent.md'), '# Agent\n\nGenerated output.');

    try {
      const post = loadPost(postDir);
      expect(post.metadata.title).toBe('Co-Authoring Trial');
      expect(post.panes.map((pane) => pane.id)).toEqual(['human', 'agent']);
      expect(post.layout.areas).toHaveLength(1);
      expect(post.panes[1].bodyHtml).toContain('Generated output');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('keeps configured pane ids in order', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const postDir = path.join(tmp, 'coauthoring-post');

    fs.mkdirSync(postDir, { recursive: true });

    const config = {
      title: 'Pane Filter Trial',
      date: '2026-07-02',
      panes: [
        { id: 'abstract', file: 'abstract.md', title: 'Abstract notes' },
        { id: 'agent', file: 'agent.md', title: 'Agent draft' },
        { id: 'view', file: 'view.md', title: 'View notes' },
        { id: 'human', file: 'human.md', title: 'Human notes' },
      ],
      sync: {
        enabled: true,
        source: 'human',
      },
    };

    fs.writeFileSync(path.join(postDir, 'post.json'), JSON.stringify(config, null, 2), 'utf8');
    createTempFile(path.join(postDir, 'abstract.md'), '# Abstract\n\nSummary.');
    createTempFile(path.join(postDir, 'agent.md'), '# Agent\n\nAgent text.');
    createTempFile(path.join(postDir, 'view.md'), '# View\n\nView text.');
    createTempFile(path.join(postDir, 'human.md'), '# Human\n\nPrimary text.');

    try {
      const post = loadPost(postDir);
      expect(post.panes.map((pane) => pane.id)).toEqual(['abstract', 'agent', 'view', 'human']);
      expect(post.panes.map((pane) => pane.title)).toEqual(['Abstract notes', 'Agent draft', 'View notes', 'Human notes']);
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

  it('renders markdown niceties for mermaid, code, math, and captioned images', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-post-'));
    const filePath = path.join(tmp, 'niceties.md');
    createTempFile(
      filePath,
      '---\ntitle: Niceties\ndate: 2026-07-03\n---\n\n```mermaid\ngraph TD\n  A-->B\n```\n\n```ts\nconst x = 1;\n```\n\nInline math $x^2$.\n\n![System diagram](diagram.png "A boxed diagram")',
    );

    try {
      const post = loadPost(filePath);
      expect(post.bodyHtml).toContain('<pre class="mermaid">graph TD');
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
      '# Human Notes\n\n## Problem statement\n### A heading with *emphasis*\n\n',
    );

    expect(signatures).toEqual([
      '1:human notes',
      '2:problem statement',
      '3:a heading with emphasis',
    ]);
  });
});
