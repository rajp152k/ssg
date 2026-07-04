import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newCommand } from '../src/commands/new';

function writeConfig(root: string): string {
  const configPath = path.join(root, 'ssg.config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
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
        paths: {
          postsDir: 'content/posts',
          templatesDir: 'templates',
          outputDir: 'public',
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  return configPath;
}

describe('new command', () => {
  it('creates a canvas-style directory post', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-new-'));
    const originalCwd = process.cwd();
    const configPath = writeConfig(tmp);

    try {
      process.chdir(tmp);
      newCommand({ title: 'My Canvas Post', configPath });

      const postDir = path.join(tmp, 'content', 'posts', 'my-canvas-post');
      const postJson = fs.readFileSync(path.join(postDir, 'post.json'), 'utf8');
      const canvas = fs.readFileSync(path.join(postDir, 'canvas.md'), 'utf8');

      expect(postJson).toContain('"id": "canvas"');
      expect(postJson).toContain('"preset": "canvas"');
      expect(canvas).toContain('# My Canvas Post');
      expect(canvas).toContain('[[note:');
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing canvas unless forced', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-new-'));
    const originalCwd = process.cwd();
    const configPath = writeConfig(tmp);

    try {
      process.chdir(tmp);
      newCommand({ title: 'My Canvas Post', configPath });
      const canvasPath = path.join(tmp, 'content', 'posts', 'my-canvas-post', 'canvas.md');
      fs.writeFileSync(canvasPath, 'custom', 'utf8');

      newCommand({ title: 'My Canvas Post', configPath });
      expect(fs.readFileSync(canvasPath, 'utf8')).toBe('custom');

      newCommand({ title: 'My Canvas Post', configPath, force: true });
      expect(fs.readFileSync(canvasPath, 'utf8')).toContain('# My Canvas Post');
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
