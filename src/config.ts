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
  theme?: string;
  font?: string;
  assistant?: string;
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

const defaultPaths = {
  postsDir: path.join('content', 'posts'),
  outputDir: 'public',
  templatesDir: path.join('templates'),
};

export const defaultConfig: SsgConfig = {
  sourceDir: process.cwd(),
  postsDir: defaultPaths.postsDir,
  outputDir: defaultPaths.outputDir,
  templatesDir: defaultPaths.templatesDir,
  site: {
    title: 'ssg',
    author: 'Author',
    description: 'A static site generated with ssg.',
    language: 'en',
    baseUrl: '',
    indexTitle: 'Posts',
    indexDescription: 'Latest posts',
    footer: "(C) {{site_copyright_year}} 'The Raj'",
    theme: 'themes/light.css',
    assistant: 'his AI',
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

export function resolveConfig(options: CliConfigOptions = {}): SsgConfig {
  const cwd = process.cwd();
  const resolvedConfigPath = options.configPath
    ? path.resolve(cwd, options.configPath)
    : path.resolve(cwd, 'ssg.config.json');

  const userConfig = loadConfigFile(resolvedConfigPath);
  const configBaseDir = fs.existsSync(resolvedConfigPath)
    ? path.dirname(resolvedConfigPath)
    : cwd;

  const postsDir = path.resolve(configBaseDir, options.postsDir ?? userConfig.paths?.postsDir ?? defaultPaths.postsDir);
  const outputDir = path.resolve(configBaseDir, options.outputDir ?? userConfig.paths?.outputDir ?? defaultPaths.outputDir);
  const templatesDir = path.resolve(configBaseDir, options.templatesDir ?? userConfig.paths?.templatesDir ?? defaultPaths.templatesDir);

  const cliPort = options.port !== undefined ? parseInt(options.port, 10) : undefined;
  const hasCliPort = typeof cliPort === 'number' && Number.isInteger(cliPort);


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
      port: hasCliPort
        ? cliPort
        : (userConfig.dev?.port ?? defaultConfig.dev.port),
    },
  };
}
