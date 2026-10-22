import { defineConfig } from 'astro/config';
import fs from 'node:fs';

const marker = {
  name: 'fixture-marker',
  hooks: {
    'astro:routes:resolved': ({ routes }) => {
      fs.writeFileSync(new URL('routes-hook.json', import.meta.url), JSON.stringify(routes.map((r) => ({
        route: r.pattern,
        type: r.type,
        origin: r.origin,
      })), null, 2));
    },
    'astro:build:start': () => {
      fs.writeFileSync(new URL('build-start.txt', import.meta.url), 'yes');
    },
    'astro:build:done': () => {
      fs.writeFileSync(new URL('build-done.txt', import.meta.url), 'yes');
    },
  },
};

export default defineConfig({
  integrations: [marker],
  redirects: {
    '/old': '/new',
    '/old-temp': { status: 302, destination: '/about' },
  },
});
