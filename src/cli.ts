import { buildCommand } from './commands/build';
import { devCommand } from './commands/dev';

function printUsage(): void {
  console.log(`Usage:
  npm run build [-- --config=ssg.config.json --postsDir=... --outDir=... --templatesDir=...]
  npm run dev [-- --config=ssg.config.json --postsDir=... --outDir=... --templatesDir=... --host=127.0.0.1 --port=3000]

Commands:
  build       Build the site from markdown posts.
  dev         Build and run local server with watch + live reload.
`);
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

  if (command === 'build') {
    buildCommand({
      postsDir,
      outputDir: outDir,
      templatesDir,
      configPath,
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
  process.exitCode = command ? 1 : 0;
}

main();
