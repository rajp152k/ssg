import fs from 'node:fs';
import path from 'node:path';

export interface CliConfigOptions {
  postsDir?: string;
  outputDir?: string;
  templatesDir?: string;
  configPath?: string;
  host?: string;
  port?: string;
}

export interface SiteConfig {
  title: string;
  author: string;
  description: string;
  language: string;
  baseUrl: string;
  indexTitle: string;
  indexDescription: string;
  footer: string;
}

export interface DevConfig {
  host: string;
  port: number;
}

export interface SsgConfig {
  sourceDir: string;
  postsDir: string;
  outputDir: string;
  templatesDir: string;
  site: SiteConfig;
  dev: DevConfig;
}

interface UserConfigFile {
  site?: Partial<SiteConfig>;
  paths?: Partial<{
    postsDir: string;
    outputDir: string;
    templatesDir: string;
  }>;
  dev?: Partial<{
    host: string;
    port: number;
  }>;
}

const defaultConfigFileName = 'ssg.config.json';

export const defaultConfig: SsgConfig = {
  sourceDir: process.cwd(),
  postsDir: path.join(process.cwd(), 'content', 'posts'),
  outputDir: path.join(process.cwd(), 'public'),
  templatesDir: path.join(process.cwd(), 'templates'),
  site: {
    title: 'ssg',
    author: 'Author',
    description: 'A static site generated with ssg.',
    language: 'en',
    baseUrl: '',
    indexTitle: 'Posts',
    indexDescription: 'Latest posts',
    footer: '',
  },
  dev: {
    host: '127.0.0.1',
    port: 3000,
  },
};

function loadConfigFile(configPath: string): UserConfigFile {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  try {
    return JSON.parse(raw) as UserConfigFile;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse config file at ${configPath}: ${message}`);
  }
}

function resolvePathValue(cwd: string, value: string | undefined, fallback: string): string {
  return path.resolve(cwd, value ?? fallback);
}

export function resolveConfig(options: CliConfigOptions = {}): SsgConfig {
  const cwd = process.cwd();
  const resolvedConfigPath = options.configPath
    ? path.resolve(cwd, options.configPath)
    : path.resolve(cwd, defaultConfigFileName);

  const userConfig = loadConfigFile(resolvedConfigPath);

  const postsDir = resolvePathValue(
    cwd,
    options.postsDir ?? userConfig.paths?.postsDir,
    path.relative(cwd, defaultConfig.postsDir),
  );

  const outputDir = resolvePathValue(
    cwd,
    options.outputDir ?? userConfig.paths?.outputDir,
    path.relative(cwd, defaultConfig.outputDir),
  );

  const templatesDir = resolvePathValue(
    cwd,
    options.templatesDir ?? userConfig.paths?.templatesDir,
    path.relative(cwd, defaultConfig.templatesDir),
  );

  const cliPort = options.port ? parseInt(options.port, 10) : undefined;

  return {
    sourceDir: cwd,
    postsDir,
    outputDir,
    templatesDir,
    site: {
      ...defaultConfig.site,
      ...(userConfig.site ?? {}),
    },
    dev: {
      host: options.host ?? userConfig.dev?.host ?? defaultConfig.dev.host,
      port: Number.isNaN(cliPort ?? NaN)
        ? userConfig.dev?.port ?? defaultConfig.dev.port
        : cliPort ?? defaultConfig.dev.port,
    },
  };
}
