import { buildCommand } from './commands/build';

function printUsage(): void {
  console.log(`Usage:
  npm run build [-- --postsDir=... --outDir=... --templatesDir=...]

Commands:
  build       Build the site from markdown posts.
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

  if (command !== 'build') {
    printUsage();
    process.exitCode = command ? 1 : 0;
    return;
  }

  const postsDir = parseArg('postsDir', args);
  const outDir = parseArg('outDir', args);
  const templatesDir = parseArg('templatesDir', args);

  buildCommand({
    postsDir,
    outputDir: outDir,
    templatesDir,
  });
}

main();
