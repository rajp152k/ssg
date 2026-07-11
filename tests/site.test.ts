import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { buildSite } from '../src/lib/site';
import type { SsgConfig } from '../src/config';

function createCanvasPost(postsDir: string, slug: string, title: string, body: string): void {
  const postDir = path.join(postsDir, slug);
  fs.mkdirSync(postDir, { recursive: true });
  fs.writeFileSync(
    path.join(postDir, 'post.json'),
    JSON.stringify(
      {
        title,
        slug,
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
    'utf8',
  );
  fs.writeFileSync(path.join(postDir, 'canvas.md'), body, 'utf8');
}

function baseConfig(tmp: string, postsDir: string, templatesDir: string, outputDir: string): SsgConfig {
  return {
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
      footer: 'Footer',
    },
    dev: { host: '127.0.0.1', port: 3000 },
  };
}

describe('site build', () => {
  it('rejects output directories that overlap authored inputs', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-paths-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'post.html'), '{{workbench_html}}', 'utf8');
    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{content}}', 'utf8');

    try {
      expect(() => buildSite(baseConfig(tmp, postsDir, templatesDir, postsDir))).toThrow('outputDir must not overlap postsDir');
      expect(() => buildSite(baseConfig(tmp, postsDir, templatesDir, templatesDir))).toThrow('outputDir must not overlap templatesDir');
      expect(fs.existsSync(templatesDir)).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('builds an empty index when no posts exist yet', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-empty-site-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'post.html'), '{{workbench_html}}', 'utf8');
    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{content}}', 'utf8');

    try {
      buildSite(baseConfig(tmp, postsDir, templatesDir, outputDir));
      expect(fs.existsSync(postsDir)).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'index.html'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('builds index and post pages from canvas directories', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');
    fs.mkdirSync(postsDir, { recursive: true });
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'post.html'), '<title>{{document_title}}</title>{{workbench_html}}{{workbench_script}}', 'utf8');
    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{site_description}}{{content}}', 'utf8');
    createCanvasPost(postsDir, 'older-post', 'Older Post', '# Older Post\n\nOld content');
    createCanvasPost(postsDir, 'newer-post', 'Newer Post', '# Newer Post\n\nNew content');

    try {
      buildSite(baseConfig(tmp, postsDir, templatesDir, outputDir));
      const index = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
      expect(index).toContain('Testing build output');
      expect(index).toContain('newer-post');
      expect(index).toContain('older-post');
      const post = fs.readFileSync(path.join(outputDir, 'newer-post', 'index.html'), 'utf8');
      expect(post).toContain('Newer Post');
      expect(post).toContain('New content');
      expect(post).toContain('data-pane-id="canvas"');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects duplicate post slugs before rendering output', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-slugs-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'post.html'), '{{workbench_html}}', 'utf8');
    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{content}}', 'utf8');
    createCanvasPost(postsDir, 'first', 'First', '# First');
    createCanvasPost(postsDir, 'second', 'Second', '# Second');
    for (const directory of ['first', 'second']) {
      const configPath = path.join(postsDir, directory, 'post.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
      config.slug = 'same-route';
      fs.writeFileSync(configPath, JSON.stringify(config), 'utf8');
    }

    try {
      expect(() => buildSite(baseConfig(tmp, postsDir, templatesDir, outputDir))).toThrow('Duplicate post slug "same-route"');
      expect(fs.existsSync(outputDir)).toBe(false);
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
    fs.writeFileSync(path.join(templatesDir, 'post.html'), '<head>{{css_import}}</head>{{workbench_html}}', 'utf8');
    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{css_import}}{{content}}', 'utf8');
    fs.mkdirSync(path.join(templatesDir, 'themes'), { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'themes', 'tbm.css'), 'body { background: #123; }', 'utf8');
    createCanvasPost(postsDir, 'themed-post', 'Themed Post', '# Themed Post');

    try {
      const config = baseConfig(tmp, postsDir, templatesDir, outputDir);
      config.site.theme = 'themes/tbm.css';
      buildSite(config);
      expect(fs.readFileSync(path.join(outputDir, 'themed-post', 'index.html'), 'utf8')).toContain('<link rel="stylesheet" href="/themes/tbm.css" />');
      expect(fs.readFileSync(path.join(outputDir, 'themes', 'tbm.css'), 'utf8')).toContain('background');
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
    fs.writeFileSync(path.join(templatesDir, 'post.html'), '<head>{{font_import}}</head>{{workbench_html}}', 'utf8');
    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{font_import}}{{content}}', 'utf8');
    fs.mkdirSync(path.join(templatesDir, 'fonts'), { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'fonts', 'Terminess.woff2'), 'fakefont', 'utf8');
    createCanvasPost(postsDir, 'font-asset-post', 'Font Asset Post', '# Font Asset Post');

    try {
      const config = baseConfig(tmp, postsDir, templatesDir, outputDir);
      config.site.font = 'fonts/Terminess.woff2';
      buildSite(config);
      const post = fs.readFileSync(path.join(outputDir, 'font-asset-post', 'index.html'), 'utf8');
      expect(post).toContain('@font-face');
      expect(post).toContain('src: url("/fonts/Terminess.woff2") format("woff2")');
      expect(fs.readFileSync(path.join(outputDir, 'fonts', 'Terminess.woff2'), 'utf8')).toContain('fakefont');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('copies post assets and escapes post metadata in generated HTML', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-assets-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'post.html'), '<title>{{document_title}}</title>{{workbench_html}}', 'utf8');
    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{content}}', 'utf8');
    createCanvasPost(postsDir, 'safe-post', '<img src=x onerror=alert(1)>', '# Safe');
    fs.writeFileSync(path.join(postsDir, 'safe-post', 'diagram.svg'), '<svg/>', 'utf8');

    try {
      buildSite(baseConfig(tmp, postsDir, templatesDir, outputDir));
      const index = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
      expect(index).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(fs.existsSync(path.join(outputDir, 'safe-post', 'diagram.svg'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('renders canvas layout with generated index and annotations', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-site-canvas-'));
    const postsDir = path.join(tmp, 'content', 'posts');
    const templatesDir = path.join(tmp, 'templates');
    const outputDir = path.join(tmp, 'public');
    fs.mkdirSync(postsDir, { recursive: true });
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'post.html'), '<article>{{workbench_html}}</article>{{workbench_script}}', 'utf8');
    fs.writeFileSync(path.join(templatesDir, 'index.html'), '{{content}}', 'utf8');
    createCanvasPost(postsDir, 'canvas-post', 'Canvas Post', '# Canvas\n\n## Section\n\nText [[note: Inline annotation.]] and [[@detail]].\n\n[[annotation:detail]]\nLong annotation.\n[[/annotation]]');

    try {
      buildSite(baseConfig(tmp, postsDir, templatesDir, outputDir));
      const post = fs.readFileSync(path.join(outputDir, 'canvas-post', 'index.html'), 'utf8');
      expect(post).toContain('data-pane-id="canvas"');
      expect(post).toContain('class="canvas-index"');
      expect(post).toContain('href="#section"');
      expect(post).toContain('data-annotation-ref="note-1"');
      expect(post).toContain('data-annotation-id="detail"');
      expect(post).toContain('syncCanvasAnnotations');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
