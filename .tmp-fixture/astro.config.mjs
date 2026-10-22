import { defineConfig } from 'astro/config';
import fs from 'node:fs';

const marker = {
  name: 'fixture-marker',
  hooks: {
    'astro:routes:resolved': ({ routes }) => {
      fs.writeFileSync('routes-hook.json', JSON.stringify(routes.map((r) => ({
        route: r.pattern,
        type: r.type,
        origin: r.origin,
      })), null, 2));
    },
    'astro:build:start': () => {
      fs.writeFileSync('build-start.txt', 'yes');
    },
    'astro:build:done': () => {
      fs.writeFileSync('build-done.txt', 'yes');
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
