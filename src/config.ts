import fs from 'node:fs';
import path from 'node:path';

export interface CliConfigOptions {
  postsDir?: string;
  outputDir?: string;
  templatesDir?: string;
  pagesDir?: string;
  meditationsDir?: string;
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
  navigation?: Array<{ label: string; href: string }>;
}

export interface DevConfig {
  host: string;
  port: number;
}

export interface SsgConfig {
  sourceDir: string;
  postsDir: string;
  pagesDir?: string;
  meditationsDir: string;
  outputDir: string;
  templatesDir: string;
  site: SiteConfig;
  dev: DevConfig;
}

interface UserConfigFile {
  site?: Partial<SiteConfig>;
  paths?: Partial<{ postsDir: string; pagesDir: string; meditationsDir: string; outputDir: string; templatesDir: string }>;
  dev?: Partial<{ host: string; port: number }>;
}

const defaultPaths = {
  postsDir: path.join('content', 'posts'),
  pagesDir: path.join('content', 'pages'),
  meditationsDir: path.join('content', 'meditations'),
  outputDir: 'public',
  templatesDir: 'templates',
};

export const defaultConfig: SsgConfig = {
  sourceDir: process.cwd(),
  postsDir: defaultPaths.postsDir,
  pagesDir: defaultPaths.pagesDir,
  meditationsDir: defaultPaths.meditationsDir,
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
    footer: '© {{site_copyright_year}} {{site_author}}.',
    theme: 'themes/modern-dark.css',
  },
  dev: { host: '127.0.0.1', port: 3000 },
};

function assertObject(value: unknown, key: string, configPath: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid config ${key} in ${configPath}: expected an object`);
  }
}

function assertOptionalString(value: unknown, key: string, configPath: string): void {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`Invalid config ${key} in ${configPath}: expected a string`);
  }
}

function assertPort(value: unknown, key: string, configPath: string): void {
  if (value !== undefined && (!Number.isInteger(value) || typeof value !== 'number' || value < 1 || value > 65535)) {
    throw new Error(`Invalid config ${key} in ${configPath}: expected an integer from 1 to 65535`);
  }
}

function validateConfig(value: unknown, configPath: string): UserConfigFile {
  assertObject(value, 'root', configPath);
  const config = value as UserConfigFile;

  if (config.site !== undefined) {
    assertObject(config.site, 'site', configPath);
    for (const key of ['title', 'author', 'description', 'language', 'baseUrl', 'indexTitle', 'indexDescription', 'footer', 'theme', 'font']) {
      assertOptionalString((config.site as Record<string, unknown>)[key], `site.${key}`, configPath);
    }
    const navigation = (config.site as Record<string, unknown>).navigation;
    if (navigation !== undefined && (!Array.isArray(navigation) || navigation.some((item) => typeof item !== 'object' || item === null || typeof (item as Record<string, unknown>).label !== 'string' || typeof (item as Record<string, unknown>).href !== 'string'))) {
      throw new Error(`Invalid config site.navigation in ${configPath}: expected { label, href }[]`);
    }
  }
  if (config.paths !== undefined) {
    assertObject(config.paths, 'paths', configPath);
    for (const key of ['postsDir', 'pagesDir', 'meditationsDir', 'outputDir', 'templatesDir']) {
      assertOptionalString((config.paths as Record<string, unknown>)[key], `paths.${key}`, configPath);
    }
  }
  if (config.dev !== undefined) {
    assertObject(config.dev, 'dev', configPath);
    assertOptionalString((config.dev as Record<string, unknown>).host, 'dev.host', configPath);
    assertPort((config.dev as Record<string, unknown>).port, 'dev.port', configPath);
  }
  return config;
}

function loadConfigFile(configPath: string): UserConfigFile {
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, 'utf8');
  try {
    return validateConfig(JSON.parse(raw), configPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('Invalid config')) throw error;
    throw new Error(`Failed to parse config file at ${configPath}: ${message}`);
  }
}

function parseCliPort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`Invalid --port value: ${value}`);
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid --port value: ${value}`);
  return port;
}

export function resolveConfig(options: CliConfigOptions = {}): SsgConfig {
  const cwd = process.cwd();
  const resolvedConfigPath = options.configPath ? path.resolve(cwd, options.configPath) : path.resolve(cwd, 'ssg.config.json');
  const userConfig = loadConfigFile(resolvedConfigPath);
  const configBaseDir = fs.existsSync(resolvedConfigPath) ? path.dirname(resolvedConfigPath) : cwd;
  const resolvePath = (value: string) => path.resolve(configBaseDir, value);
  const cliPort = parseCliPort(options.port);

  return {
    sourceDir: configBaseDir,
    postsDir: resolvePath(options.postsDir ?? userConfig.paths?.postsDir ?? defaultPaths.postsDir),
    pagesDir: resolvePath(options.pagesDir ?? userConfig.paths?.pagesDir ?? defaultPaths.pagesDir),
    meditationsDir: resolvePath(options.meditationsDir ?? userConfig.paths?.meditationsDir ?? defaultPaths.meditationsDir),
    outputDir: resolvePath(options.outputDir ?? userConfig.paths?.outputDir ?? defaultPaths.outputDir),
    templatesDir: resolvePath(options.templatesDir ?? userConfig.paths?.templatesDir ?? defaultPaths.templatesDir),
    site: { ...defaultConfig.site, ...(userConfig.site ?? {}) },
    dev: {
      host: options.host ?? userConfig.dev?.host ?? defaultConfig.dev.host,
      port: cliPort ?? userConfig.dev?.port ?? defaultConfig.dev.port,
    },
  };
}
