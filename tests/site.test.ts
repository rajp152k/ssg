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

  it('copies configured theme css to output and injects it into templates', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-theme-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');

    fs.mkdirSync(postsDir, { recursive: true });
    fs.mkdirSync(templatesDir, { recursive: true });

    fs.writeFileSync(
      path.join(templatesDir, 'post.html'),
      '<!doctype html><html><head>{{css_import}}</head><body>{{title}}</body></html>',
      'utf8',
    );

    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{css_import}}{{content}}', 'utf8');

    fs.mkdirSync(path.join(templatesDir, 'themes'), { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'themes', 'tbm.css'), 'body { background: #123; }', 'utf8');

    fs.writeFileSync(
      path.join(postsDir, 'sample.md'),
      '---\ntitle: Themed Post\ndate: 2026-07-02\n---\n\nThemed output.',
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
        theme: 'themes/tbm.css',
      },
      dev: {
        host: '127.0.0.1',
        port: 3000,
      },
    };

    try {
      buildSite(config);

      const post = fs.readFileSync(path.join(outputDir, 'themed-post', 'index.html'), 'utf8');
      expect(post).toContain('<link rel="stylesheet" href="/themes/tbm.css" />');

      const index = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
      expect(index).toContain('<link rel="stylesheet" href="/themes/tbm.css" />');

      const themeAsset = fs.readFileSync(path.join(outputDir, 'themes', 'tbm.css'), 'utf8');
      expect(themeAsset).toContain('background');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('copies configured font css to output and injects it into templates', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-font-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');

    fs.mkdirSync(postsDir, { recursive: true });
    fs.mkdirSync(templatesDir, { recursive: true });

    fs.writeFileSync(
      path.join(templatesDir, 'post.html'),
      '<!doctype html><html><head>{{font_import}}</head><body>{{title}}</body></html>',
      'utf8',
    );
    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{font_import}}{{content}}', 'utf8');

    fs.mkdirSync(path.join(templatesDir, 'fonts'), { recursive: true });
    fs.writeFileSync(
      path.join(templatesDir, 'fonts', 'terminess.css'),
      ':root { --test-font: true; }',
      'utf8',
    );

    fs.writeFileSync(
      path.join(postsDir, 'sample.md'),
      '---\ntitle: Fonted Post\ndate: 2026-07-02\n---\n\nFonted output.',
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
        font: 'fonts/terminess.css',
      },
      dev: {
        host: '127.0.0.1',
        port: 3000,
      },
    };

    try {
      buildSite(config);

      const post = fs.readFileSync(path.join(outputDir, 'fonted-post', 'index.html'), 'utf8');
      expect(post).toContain('<link rel="stylesheet" href="/fonts/terminess.css" />');

      const index = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
      expect(index).toContain('<link rel="stylesheet" href="/fonts/terminess.css" />');

      const fontAsset = fs.readFileSync(path.join(outputDir, 'fonts', 'terminess.css'), 'utf8');
      expect(fontAsset).toContain('--test-font');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('injects inline @font-face when site.font points to a font asset', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-font-asset-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');

    fs.mkdirSync(postsDir, { recursive: true });
    fs.mkdirSync(templatesDir, { recursive: true });

    fs.writeFileSync(
      path.join(templatesDir, 'post.html'),
      '<!doctype html><html><head>{{font_import}}</head><body>{{title}}</body></html>',
      'utf8',
    );
    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{font_import}}{{content}}', 'utf8');

    fs.mkdirSync(path.join(templatesDir, 'fonts'), { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'fonts', 'Terminess.woff2'), 'fakefont', 'utf8');

    fs.writeFileSync(
      path.join(postsDir, 'sample.md'),
      '---\ntitle: Font Asset Post\ndate: 2026-07-02\n---\n\nFont asset output.',
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
        font: 'fonts/Terminess.woff2',
      },
      dev: {
        host: '127.0.0.1',
        port: 3000,
      },
    };

    try {
      buildSite(config);

      const post = fs.readFileSync(path.join(outputDir, 'font-asset-post', 'index.html'), 'utf8');
      expect(post).toContain('@font-face');
      expect(post).toContain('src: url("/fonts/Terminess.woff2") format("woff2")');
      expect(post).toContain('font-family: "Terminess"');

      const index = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
      expect(index).toContain('@font-face');

      const fontAsset = fs.readFileSync(path.join(outputDir, 'fonts', 'Terminess.woff2'), 'utf8');
      expect(fontAsset).toContain('fakefont');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('renders pane titles from template placeholders and date-only metadata header', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-pane-meta-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');

    fs.mkdirSync(postsDir, { recursive: true });
    fs.mkdirSync(templatesDir, { recursive: true });

    fs.writeFileSync(
      path.join(templatesDir, 'post.html'),
      '<!doctype html><html><body><p class="meta">{{date}}</p>{{workbench_html}}</body></html>',
      'utf8',
    );
    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{content}}', 'utf8');

    const postDir = path.join(postsDir, 'templated-panes');
    fs.mkdirSync(postDir, { recursive: true });

    fs.writeFileSync(
      path.join(postDir, 'post.json'),
      JSON.stringify(
        {
          title: 'Templated Pane Titles',
          slug: 'templated-panes',
          date: '2026-07-02',
          panes: [
            { id: 'human', title: '{{author}}' },
            { id: 'agent', title: '{{assistant}}' },
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

    fs.writeFileSync(path.join(postDir, 'human.md'), '# Human\n\nI write.', 'utf8');
    fs.writeFileSync(path.join(postDir, 'agent.md'), '# AI\n\nI draft.', 'utf8');

    const config: SsgConfig = {
      sourceDir: tmp,
      postsDir,
      templatesDir,
      outputDir,
      site: {
        title: 'Test Site',
        author: 'Raj',
        description: 'desc',
        language: 'en',
        baseUrl: '',
        indexTitle: 'Posts',
        indexDescription: 'desc',
        footer: 'Footer',
        assistant: 'his AI',
      },
      dev: {
        host: '127.0.0.1',
        port: 3000,
      },
    };

    try {
      buildSite(config);

      const post = fs.readFileSync(path.join(outputDir, 'templated-panes', 'index.html'), 'utf8');
      expect(post).toContain('<p class="meta">2026-07-02</p>');
      expect(post).toContain('<h2>Raj</h2>');
      expect(post).toContain('<h2>his AI</h2>');
      expect(post).not.toContain('•');
      expect(post).not.toContain('{{author}}');
      expect(post).not.toContain('{{assistant}}');
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

  it('builds workbench posts even when headings differ between panes', () => {
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
      expect(() => buildSite(config)).not.toThrow();
      const post = fs.readFileSync(path.join(outputDir, 'mismatched-workbench', 'index.html'), 'utf8');
      expect(post).toContain('id="ssg-workbench"');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

