import fs from 'node:fs';
import path from 'node:path';
import type { Post } from '../types';
import { renderTemplate, formatDate } from './template';
import { collectMarkdownFiles, loadPost } from './post';
import type { SsgConfig } from '../config';

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

function renderPostsIndexTemplate(posts: Post[], template: string): string {
  const items = posts
    .map((post) => {
      return `<li><a href="./${post.metadata.slug}/">${post.metadata.title}</a> <time datetime="${post.metadata.isoDate}">${formatDate(post.metadata.date)}</time></li>`;
    })
    .join('\n');

  return renderTemplate(template, {
    title: 'Posts',
    content: `<ul>${items}</ul>`,
    date: '',
  });
}

export function buildSite(config: SsgConfig): void {
  const postsDir = path.resolve(process.cwd(), config.postsDir);
  const outputDir = path.resolve(process.cwd(), config.outputDir);
  const templatesDir = path.resolve(process.cwd(), config.templatesDir);

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
    const pageHtml = renderTemplate(postTemplate, {
      title: post.metadata.title,
      date: formatDate(post.metadata.date),
      content: post.bodyHtml,
    });
    writePage(outputDir, post.metadata.slug, pageHtml);
  }

  const indexHtml = renderPostsIndexTemplate(posts, indexTemplate);
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml, 'utf8');
}
