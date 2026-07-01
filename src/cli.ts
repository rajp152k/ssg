import { buildCommand } from './commands/build';
import { devCommand } from './commands/dev';

function printUsage(): void {
  console.log(`Usage:
  npm run build [-- --postsDir=... --outDir=... --templatesDir=...]
  npm run dev [-- --postsDir=... --outDir=... --templatesDir=... --port=3000]

Commands:
  build       Build the site from markdown posts.
  dev         Build and run local server with file watching + live reload.
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

  if (command === 'build') {
    buildCommand({
      postsDir,
      outputDir: outDir,
      templatesDir,
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
      port,
      host,
    });
    return;
  }

  printUsage();
  process.exitCode = command ? 1 : 0;
}

main();
