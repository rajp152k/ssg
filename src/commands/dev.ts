import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { buildSite } from '../lib/site';
import { resolveConfig, type CliConfigOptions, type SsgConfig } from '../config';

interface DevOptions extends CliConfigOptions {
  port?: string;
  host?: string;
}

const LIVE_RELOAD_PATH = '/__ssg__/events';

export interface DevCommandOptions extends DevOptions {}

export function devCommand(options: DevCommandOptions = {}): void {
  const config = resolveConfig(options);
  const host = options.host ?? '127.0.0.1';
  const parsedPort = parseInt(options.port ?? '3000', 10);
  const port = Number.isNaN(parsedPort) ? 3000 : parsedPort;

  const clients = new Set<http.ServerResponse>();
  const watchers: fs.FSWatcher[] = [];

  const projectRoot = process.cwd();
  const outputDir = path.resolve(projectRoot, config.outputDir);
  const watchPaths = [
    config.postsDir,
    config.templatesDir,
  ];

  let rebuildTimer: NodeJS.Timeout | null = null;

  const notifyReload = () => {
    for (const client of clients) {
      client.write('event: reload\n');
      client.write('data: changed\n\n');
    }
  };

  const scheduleRebuild = () => {
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
    }

    rebuildTimer = setTimeout(() => {
      try {
        buildSite(config);
        console.log(`[${new Date().toLocaleTimeString()}] Rebuilt`);
        notifyReload();
      } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Rebuild failed:`, error);
      }
    }, 120);
  };

  const startWatch = () => {
    const uniqueWatchPaths = [...new Set(watchPaths.map((p) => path.resolve(p)))];

    for (const target of uniqueWatchPaths) {
      if (!fs.existsSync(target)) {
        continue;
      }

      const watcher = fs.watch(target, { recursive: true }, () => {
        scheduleRebuild();
      });

      watchers.push(watcher);
    }

    if (watchers.length === 0) {
      console.warn('No watch paths found. Continuing with no-file watch.');
    }
  };

  const close = (server: http.Server) => {
    watchers.forEach((watcher) => watcher.close());
    server.close(() => process.exit(0));
  };

  const onRequest = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const requestUrl = new URL(req.url || '/', `http://${host}:${port}`);
    const pathname = decodeURIComponent(requestUrl.pathname || '/');

    if (pathname === LIVE_RELOAD_PATH) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      });
      res.write('retry: 1000\n');
      clients.add(res);

      const onClose = () => {
        clients.delete(res);
      };
      req.on('close', onClose);
      req.on('error', onClose);
      return;
    }

    const safePath = pathname
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');

    let normalizedPath = safePath || 'index.html';
    const hasExtension = path.extname(normalizedPath).length > 0;
    const isDirectory = normalizedPath.endsWith('/');

    if (isDirectory) {
      normalizedPath = `${normalizedPath}index.html`;
    } else if (!hasExtension) {
      normalizedPath = `${normalizedPath.replace(/\/$/, '')}/index.html`;
    }

    const target = path.resolve(outputDir, normalizedPath);
    if (!target.startsWith(outputDir)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    fs.readFile(target, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const ext = path.extname(target).toLowerCase();
      if (ext === '.html') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(injectReloadScript(data.toString('utf8')));
        return;
      }

      if (ext === '.css') {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      } else if (ext === '.js') {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      }

      res.statusCode = 200;
      res.end(data);
    });
  };

  buildSite(config as SsgConfig);
  console.log(`Built site to ${outputDir}`);
  startWatch();

  const server = http.createServer(onRequest);
  server.listen(port, host, () => {
    console.log(`\nSSG dev server running at http://${host}:${port}`);
    console.log('Watching:');
    console.log(`- ${config.postsDir}`);
    console.log(`- ${config.templatesDir}`);
  });

  process.on('SIGINT', () => {
    close(server);
  });
}

function injectReloadScript(html: string): string {
  const marker = '</body>';
  const script = `\n<script>\n(function(){\n  const source = new EventSource('${LIVE_RELOAD_PATH}');\n  source.addEventListener('reload', function () {\n    window.location.reload();\n  });\n})();\n</script>\n`;
  const index = html.lastIndexOf(marker);
  if (index >= 0) {
    return `${html.slice(0, index)}${script}${html.slice(index)}`;
  }

  return html + script;
}
