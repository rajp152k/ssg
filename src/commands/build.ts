import path from 'node:path';
import { buildSite } from '../lib/site';
import { defaultConfig, type SsgConfig } from '../config';

export interface BuildOptions {
  postsDir?: string;
  outputDir?: string;
  templatesDir?: string;
}

export function buildCommand(options: BuildOptions = {}): void {
  const config: SsgConfig = {
    ...defaultConfig,
    postsDir: options.postsDir ? path.resolve(process.cwd(), options.postsDir) : defaultConfig.postsDir,
    outputDir: options.outputDir ?? defaultConfig.outputDir,
    templatesDir: options.templatesDir ? path.resolve(process.cwd(), options.templatesDir) : defaultConfig.templatesDir,
  };

  buildSite(config);
  console.log(`Built site to ${path.resolve(process.cwd(), config.outputDir)}`);
}
