import { buildCommand } from './commands/build';
import { devCommand } from './commands/dev';
import { newCommand } from './commands/new';

function printUsage(): void {
  console.log(`Usage:
  ssg build [--config=ssg.config.json --postsDir=... --outDir=... --templatesDir=...]
  ssg dev [--config=ssg.config.json --postsDir=... --outDir=... --templatesDir=... --host=127.0.0.1 --port=3000]
  ssg new "Post title" [--force]

Commands:
  build       Build the site.
  dev         Build and run local server with watch + live reload.
  new         Create a canvas-style directory post.
  help        Show this help.
`);
}

function hasFlag(key: string, args: string[]): boolean {
  return args.includes(`--${key}`);
}

function parseArg(key: string, args: string[]): string | undefined {
  const prefix = `--${key}=`;
  const token = args.find((arg) => arg.startsWith(prefix));
  if (!token) return undefined;
  return token.slice(prefix.length);
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  const postsDir = parseArg('postsDir', args);
  const outDir = parseArg('outDir', args);
  const templatesDir = parseArg('templatesDir', args);
  const configPath = parseArg('config', args);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === 'build') {
    buildCommand({
      postsDir,
      outputDir: outDir,
      templatesDir,
      configPath,
    });
    return;
  }

  if (command === 'new') {
    const title = args.filter((arg) => !arg.startsWith('--')).slice(1).join(' ');
    newCommand({
      title,
      postsDir,
      outputDir: outDir,
      templatesDir,
      configPath,
      force: hasFlag('force', args),
    });
    return;
  }

  if (command === 'dev') {
    const port = parseArg('port', args);
    const host = parseArg('host', args);

    devCommand({
      postsDir,
      outputDir: outDir,
      templatesDir,
      configPath,
      port,
      host,
    });
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main();
