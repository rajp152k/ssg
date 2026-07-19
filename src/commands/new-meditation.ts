import fs from 'node:fs';
import path from 'node:path';
import { resolveConfig, type CliConfigOptions } from '../config';
import { slugify } from '../lib/slug';

export interface NewMeditationOptions extends CliConfigOptions {
  title: string;
}

export function newMeditationCommand(options: NewMeditationOptions): void {
  const title = options.title.trim();
  if (!title) throw new Error('Meditation title is required. Usage: ssg new-meditation "Title"');

  const config = resolveConfig(options);
  const slug = slugify(title);
  if (!slug || slug === 'page') throw new Error(`Meditation title produces an invalid or reserved slug: ${title}`);

  const filePath = path.join(config.meditationsDir, `${slug}.md`);
  if (fs.existsSync(filePath)) throw new Error(`Meditation already exists: ${filePath}`);

  const date = new Date().toISOString().slice(0, 10);
  const content = `---\ntitle: ${title}\ndate: ${date}\n---\n\nStart writing.\n`;
  fs.mkdirSync(config.meditationsDir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Created meditation at ${filePath}`);
}
