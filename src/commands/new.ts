import fs from 'node:fs';
import path from 'node:path';
import { resolveConfig, type CliConfigOptions } from '../config';
import { derivePostSlug } from '../lib/slug';

export interface NewPostOptions extends CliConfigOptions {
  title: string;
  force?: boolean;
}

function writeFileSafe(filePath: string, content: string, force: boolean): 'created' | 'overwritten' | 'skipped' {
  if (fs.existsSync(filePath) && !force) {
    return 'skipped';
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existed = fs.existsSync(filePath);
  fs.writeFileSync(filePath, content, 'utf8');
  return existed ? 'overwritten' : 'created';
}

export function newCommand(options: NewPostOptions): void {
  const title = options.title.trim();
  if (!title) {
    throw new Error('Post title is required. Usage: ssg new "Post title"');
  }

  const config = resolveConfig(options);
  const slug = derivePostSlug(title, config.postsDir);
  const postDir = path.join(config.postsDir, slug);
  const force = options.force ?? false;

  if (fs.existsSync(postDir) && !fs.statSync(postDir).isDirectory()) {
    throw new Error(`Cannot create post directory; path exists and is not a directory: ${postDir}`);
  }

  const postJson = `${JSON.stringify(
    {
      title,
      panes: [
        { id: 'index', title: 'Index', generated: 'index', source: 'canvas' },
        { id: 'canvas', title: 'Canvas', file: 'canvas.md' },
        { id: 'annotations', title: 'Annotations', generated: 'annotations', source: 'canvas' },
      ],
      layout: { preset: 'canvas' },
      sync: { enabled: false, source: 'canvas' },
    },
    null,
    2,
  )}\n`;

  const canvas = `# ${title}\n\nStart writing on the canvas. [[note: Add short annotations inline like this.]]\n\n## Notes\n\nLonger annotations can use a stable reference. [[@first-note]]\n\n[[annotation:first-note]]\nWrite the longer annotation here.\n[[/annotation]]\n`;

  const results = [
    ['post.json', writeFileSafe(path.join(postDir, 'post.json'), postJson, force)],
    ['canvas.md', writeFileSafe(path.join(postDir, 'canvas.md'), canvas, force)],
  ] as const;

  console.log(`Created canvas post at ${postDir}`);
  for (const [file, result] of results) {
    console.log(`  ${result}: ${file}`);
  }
}
