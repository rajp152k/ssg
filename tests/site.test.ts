import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { buildSite } from '../src/lib/site';
import type { SsgConfig } from '../src/config';

describe('site build', () => {
  it('builds index and post pages from markdown', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');

    fs.mkdirSync(postsDir, { recursive: true });
    fs.mkdirSync(templatesDir, { recursive: true });

    const postTemplate = `<!doctype html>\n<title>{{document_title}}</title>\n<body>{{title}} - {{date}} - {{content}}</body>`;
    const indexTemplate = `<!doctype html>\n<title>{{site_title}}</title>\n<body>{{site_description}}{{content}}</body>`;

    fs.writeFileSync(path.join(templatesDir, 'post.html'), postTemplate, 'utf8');
    fs.writeFileSync(path.join(templatesDir, 'index.html'), indexTemplate, 'utf8');

    const older = `---\ntitle: Older Post\ndate: 2026-06-01\n---\nOld content`;
    const newer = `---\ntitle: Newer Post\ndate: 2026-07-02\n---\nNew content`;

    fs.writeFileSync(path.join(postsDir, 'older.md'), older, 'utf8');
    fs.writeFileSync(path.join(postsDir, 'newer.md'), newer, 'utf8');

    const config: SsgConfig = {
      sourceDir: tmp,
      postsDir,
      templatesDir,
      outputDir,
      site: {
        title: 'Test Site',
        author: 'Tester',
        description: 'Testing build output',
        language: 'en',
        baseUrl: '',
        indexTitle: 'Posts',
        indexDescription: 'Read latest',
        footer: '',
      },
      dev: {
        host: '127.0.0.1',
        port: 3000,
      },
    };

    try {
      buildSite(config);

      const index = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
      expect(index).toContain('Testing build output');

      const newerIndex = index.indexOf('newer-post');
      const olderIndex = index.indexOf('older-post');
      expect(newerIndex).toBeGreaterThan(-1);
      expect(olderIndex).toBeGreaterThan(-1);
      expect(newerIndex).toBeLessThan(olderIndex);

      const post = fs.readFileSync(path.join(outputDir, 'newer-post', 'index.html'), 'utf8');
      expect(post).toContain('Newer Post');
      expect(post).toContain('07-02');
      expect(post).toContain('Test Site');
      expect(post).toContain('New content');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('renders post meta date and content correctly', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');

    fs.mkdirSync(postsDir, { recursive: true });
    fs.mkdirSync(templatesDir, { recursive: true });

    fs.writeFileSync(
      path.join(templatesDir, 'post.html'),
      '<h1>{{title}}</h1>\n<p>{{date}}</p>\n<article>{{content}}</article>',
      'utf8',
    );

    fs.writeFileSync(
      path.join(templatesDir, 'index.html'),
      '{{content}}',
      'utf8',
    );

    fs.writeFileSync(
      path.join(postsDir, 'sample.md'),
      '---\ntitle: Sample\ndate: 2026-07-02\n---\n\nThis is **sample** markdown.',
      'utf8',
    );

    const config: SsgConfig = {
      sourceDir: tmp,
      postsDir,
      templatesDir,
      outputDir,
      site: {
        title: 'Test Site',
        author: 'Author',
        description: 'desc',
        language: 'en',
        baseUrl: '',
        indexTitle: 'Posts',
        indexDescription: 'desc',
        footer: 'Footer',
      },
      dev: {
        host: '127.0.0.1',
        port: 3000,
      },
    };

    try {
      buildSite(config);

      const post = fs.readFileSync(path.join(outputDir, 'sample', 'index.html'), 'utf8');
      expect(post).toContain('<p>2026-07-02</p>');
      expect(post).toContain('<strong>sample</strong>');
      expect(post).toContain('<h1>Sample</h1>');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('throws when a synced workbench post has mismatched headings', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-sync-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');

    fs.mkdirSync(postsDir, { recursive: true });
    fs.mkdirSync(templatesDir, { recursive: true });

    fs.writeFileSync(
      path.join(templatesDir, 'post.html'),
      '<article>{{workbench_html}}</article>{{workbench_script}}',
      'utf8',
    );

    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{content}}', 'utf8');

    const postDir = path.join(postsDir, 'mismatched-workbench');
    fs.mkdirSync(postDir, { recursive: true });

    fs.writeFileSync(
      path.join(postDir, 'post.json'),
      JSON.stringify(
        {
          title: 'Mismatched Workbench',
          date: '2026-07-03',
          panes: [
            { id: 'human', file: 'human.md', title: 'Human' },
            { id: 'agent', file: 'agent.md', title: 'Agent' },
          ],
          layout: {
            preset: '1x2',
          },
          sync: {
            enabled: true,
            source: 'human',
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    fs.writeFileSync(path.join(postDir, 'human.md'), '# Human Notes\n\n## Problem statement\n\nA shared opening section.\n## Context\n\nShared context.', 'utf8');
    fs.writeFileSync(
      path.join(postDir, 'agent.md'),
      '# Agent Notes\n\n## Different heading\n\nThis does not match.',
      'utf8',
    );

    const config: SsgConfig = {
      sourceDir: tmp,
      postsDir,
      templatesDir,
      outputDir,
      site: {
        title: 'Test Site',
        author: 'Author',
        description: 'desc',
        language: 'en',
        baseUrl: '',
        indexTitle: 'Posts',
        indexDescription: 'desc',
        footer: '',
      },
      dev: {
        host: '127.0.0.1',
        port: 3000,
      },
    };

    try {
      expect(() => buildSite(config)).toThrow(
        /Workbench sync headings differ for post .*mismatched-workbench/,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

