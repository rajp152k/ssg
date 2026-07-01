import fs from 'node:fs';
import path from 'node:path';
import type { Post } from '../types';
import { renderTemplate, formatDate } from './template';
import { collectMarkdownFiles, loadPost } from './post';
import type { SsgConfig } from '../config';

type TemplateContext = Record<string, string>;

function readTemplate(templatesDir: string, name: string): string {
  const templatePath = path.join(templatesDir, name);
  return fs.readFileSync(templatePath, 'utf8');
}

function writePage(outputDir: string, slug: string, html: string): void {
  const pageDir = path.join(outputDir, slug);
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(path.join(pageDir, 'index.html'), html, 'utf8');
}

function sortPostsByDateDesc(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => b.metadata.date.getTime() - a.metadata.date.getTime());
}

function buildTemplateContext(config: SsgConfig, overrides: TemplateContext): TemplateContext {
  const year = new Date().getFullYear().toString();

  const baseContext: TemplateContext = {
    site_title: config.site.title,
    site_author: config.site.author,
    site_description: config.site.description,
    site_language: config.site.language,
    site_url: config.site.baseUrl,
    site_index_title: config.site.indexTitle,
    site_index_description: config.site.indexDescription,
    site_footer: config.site.footer,
    site_copyright_year: year,
  };

  return {
    ...baseContext,
    ...overrides,
  };
}

function renderPostsIndexTemplate(posts: Post[], template: string, config: SsgConfig): string {
  const items = posts
    .map((post) => {
      return `<li><a href="./${post.metadata.slug}/">${post.metadata.title}</a> <time datetime="${post.metadata.isoDate}">${formatDate(post.metadata.date)}</time></li>`;
    })
    .join('\n');

  return renderTemplate(
    template,
    buildTemplateContext(config, {
      title: config.site.indexTitle,
      page_title: config.site.indexTitle,
      content: `<ul>${items}</ul>`,
      description: config.site.indexDescription,
    }),
  );
}

export function buildSite(config: SsgConfig): void {
  const postsDir = config.postsDir;
  const outputDir = config.outputDir;
  const templatesDir = config.templatesDir;

  if (!fs.existsSync(postsDir)) {
    throw new Error(`Posts directory does not exist: ${postsDir}`);
  }

  const postTemplate = readTemplate(templatesDir, 'post.html');
  const indexTemplate = readTemplate(templatesDir, 'index.html');

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const filePaths = collectMarkdownFiles(postsDir);
  const posts = sortPostsByDateDesc(filePaths.map((filePath) => loadPost(filePath)));

  for (const post of posts) {
    const pageHtml = renderTemplate(
      postTemplate,
      buildTemplateContext(config, {
        title: post.metadata.title,
        date: formatDate(post.metadata.date),
        content: post.bodyHtml,
        document_title: `${post.metadata.title} · ${config.site.title}`,
        document_description: `${post.metadata.title} by ${config.site.author}`,
      }),
    );
    writePage(outputDir, post.metadata.slug, pageHtml);
  }

  const indexHtml = renderPostsIndexTemplate(posts, indexTemplate, config);
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml, 'utf8');
}
