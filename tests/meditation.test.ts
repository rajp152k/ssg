import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newMeditationCommand } from '../src/commands/new-meditation';
import { loadMeditation } from '../src/lib/meditation';

function writeConfig(root: string): string {
  const configPath = path.join(root, 'ssg.config.json');
  fs.writeFileSync(configPath, JSON.stringify({ paths: { meditationsDir: 'content/meditations' } }), 'utf8');
  return configPath;
}

describe('meditations', () => {
  it('loads strict title and date front matter', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-meditation-'));
    const filePath = path.join(tmp, 'quiet-morning.md');
    fs.writeFileSync(filePath, '---\ntitle: Quiet morning\ndate: 2026-07-19\n---\n\nA short **thought**.\n', 'utf8');

    try {
      const meditation = loadMeditation(filePath);
      expect(meditation.title).toBe('Quiet morning');
      expect(meditation.date.toISOString()).toBe('2026-07-19T00:00:00.000Z');
      expect(meditation.slug).toBe('quiet-morning');
      expect(meditation.bodyHtml).toContain('<strong>thought</strong>');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects extra front matter', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-meditation-'));
    const filePath = path.join(tmp, 'invalid.md');
    fs.writeFileSync(filePath, '---\ntitle: Invalid\ndate: 2026-07-19\ntags: no\n---\n', 'utf8');

    try {
      expect(() => loadMeditation(filePath)).toThrow('Unknown meditation front matter key');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('creates a meditation without overwriting it', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-meditation-'));
    const configPath = writeConfig(tmp);
    const originalCwd = process.cwd();

    try {
      process.chdir(tmp);
      newMeditationCommand({ title: 'A Quiet Morning', configPath });
      const filePath = path.join(tmp, 'content', 'meditations', 'a-quiet-morning.md');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toMatch(/^---\ntitle: A Quiet Morning\ndate: \d{4}-\d{2}-\d{2}\n---/);
      expect(() => newMeditationCommand({ title: 'A Quiet Morning', configPath })).toThrow('Meditation already exists');
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
