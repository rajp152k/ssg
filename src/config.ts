import path from 'node:path';

export interface SsgConfig {
  sourceDir: string;
  postsDir: string;
  outputDir: string;
  templatesDir: string;
}

export const defaultConfig: SsgConfig = {
  sourceDir: process.cwd(),
  postsDir: path.join('content', 'posts'),
  outputDir: 'public',
  templatesDir: 'templates',
};
