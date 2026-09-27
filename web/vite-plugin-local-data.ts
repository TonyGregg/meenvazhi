import type { Plugin } from 'vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = fileURLToPath(new URL('../public-data', import.meta.url));

const TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.gpx': 'application/gpx+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
};

/**
 * Serve ../public-data at /data/* during development.
 *
 * Preferred over a symlink inside public/: Vite's handling of symlinked public
 * directories has varied between versions and can silently break `vite build`.
 */
export function localData(): Plugin {
  return {
    name: 'meenvazhi-local-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/data/')) return next();

        // normalize collapses any ../ before it can escape the data directory.
        const rel = normalize(decodeURIComponent(url.slice('/data/'.length)));
        if (rel.startsWith('..')) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }

        const file = join(DATA_DIR, rel);
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end(`not found: ${rel}. Run the pipeline first, see pipeline/README.`);
          return;
        }

        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(file).pipe(res);
      });
    },
  };
}
