import path from 'node:path';

export interface SsgConfig {
  sourceDir: string;
  postsDir: string;
  outputDir: string;
  templatesDir: string;
}

export interface CliConfigOptions {
  postsDir?: string;
  outputDir?: string;
  templatesDir?: string;
}

export const defaultConfig: SsgConfig = {
  sourceDir: process.cwd(),
  postsDir: path.join('content', 'posts'),
  outputDir: 'public',
  templatesDir: 'templates',
};

export function resolveConfig(options: CliConfigOptions = {}): SsgConfig {
  const cwd = process.cwd();

  return {
    sourceDir: cwd,
    postsDir: options.postsDir ? path.resolve(cwd, options.postsDir) : path.join(cwd, defaultConfig.postsDir),
    outputDir: options.outputDir ?? defaultConfig.outputDir,
    templatesDir: options.templatesDir ? path.resolve(cwd, options.templatesDir) : path.join(cwd, defaultConfig.templatesDir),
  };
}
