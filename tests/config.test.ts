import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { defaultConfig, resolveConfig } from '../src/config';

describe('config resolution', () => {
  it('loads and merges config file values', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-config-'));
    const configPath = path.join(tmp, 'ssg.config.json');

    const content = {
      site: {
        title: 'Test Site',
        author: 'Test Author',
        theme: 'themes/tbm.css',
        font: 'fonts/terminess.css',
      },
      paths: {
        postsDir: 'posts',
        meditationsDir: 'meditations',
        templatesDir: 'templates',
        outputDir: 'build',
      },
      dev: {
        host: '0.0.0.0',
        port: 4242,
      },
    };

    fs.writeFileSync(configPath, JSON.stringify(content, null, 2), 'utf8');

    try {
      const config = resolveConfig({ configPath });

      expect(config.site.title).toBe('Test Site');
      expect(config.site.author).toBe('Test Author');
      expect(config.site.theme).toBe('themes/tbm.css');
      expect(config.site.font).toBe('fonts/terminess.css');
      expect(config.sourceDir).toBe(tmp);
      expect(config.postsDir).toBe(path.join(tmp, 'posts'));
      expect(config.meditationsDir).toBe(path.join(tmp, 'meditations'));
      expect(config.templatesDir).toBe(path.join(tmp, 'templates'));
      expect(config.outputDir).toBe(path.join(tmp, 'build'));
      expect(config.dev.host).toBe('0.0.0.0');
      expect(config.dev.port).toBe(4242);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('allows CLI overrides for paths, host and port', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-config-'));
    const configPath = path.join(tmp, 'ssg.config.json');

    const content = {
      site: {
        title: 'Defaulted Site',
      },
      paths: {
        postsDir: 'posts',
        templatesDir: 'templates',
        outputDir: 'build',
      },
      dev: {
        host: '0.0.0.0',
        port: 4242,
      },
    };

    fs.writeFileSync(configPath, JSON.stringify(content, null, 2), 'utf8');

    try {
      const config = resolveConfig({
        configPath,
        postsDir: 'cli-posts',
        meditationsDir: 'cli-meditations',
        host: '127.0.0.2',
        port: '5000',
      });

      expect(config.postsDir).toBe(path.join(tmp, 'cli-posts'));
      expect(config.meditationsDir).toBe(path.join(tmp, 'cli-meditations'));
      expect(config.dev.host).toBe('127.0.0.2');
      expect(config.dev.port).toBe(5000);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('falls back to defaults when config is missing', () => {
    const missingPath = path.join(os.tmpdir(), 'ssg-does-not-exist.json');
    const config = resolveConfig({
      configPath: missingPath,
    });

    expect(config.site.title).toBe(defaultConfig.site.title);
    expect(config.postsDir).toContain(path.join(process.cwd(), defaultConfig.postsDir));
    expect(config.templatesDir).toContain(path.join(process.cwd(), defaultConfig.templatesDir));
  });

  it('rejects invalid config values and CLI ports', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-config-'));
    const configPath = path.join(tmp, 'ssg.config.json');
    fs.writeFileSync(configPath, JSON.stringify({ dev: { port: 70000 } }), 'utf8');

    try {
      expect(() => resolveConfig({ configPath })).toThrow('dev.port');
      expect(() => resolveConfig({ port: '3000junk' })).toThrow('Invalid --port');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('throws for malformed JSON', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-config-'));
    const configPath = path.join(tmp, 'ssg.config.json');

    fs.writeFileSync(configPath, '{"site": { "title": "broken"', 'utf8');

    try {
      expect(() => resolveConfig({ configPath })).toThrow('Failed to parse config file');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
