import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  entrypointPath,
  getRedirectInfo,
  normalizeRoutes,
  routePath,
} from '../src/routes.js';

const root = process.cwd();

const routes = [
  {
    pattern: '/about',
    type: 'page',
    isPrerendered: true,
    entrypoint: path.join(root, 'src/pages/about.astro'),
    origin: 'project',
  },
  {
    pattern: '/',
    type: 'page',
    isPrerendered: true,
    entrypoint: 'src/pages/index.astro',
    origin: 'project',
  },
  {
    pattern: '/api/health',
    type: 'endpoint',
    isPrerendered: false,
    entrypoint: 'src/pages/api/health.ts',
    origin: 'project',
  },
  {
    pattern: '/old',
    type: 'redirect',
    isPrerendered: true,
    entrypoint: '/old',
    redirect: '/new',
    origin: 'project',
  },
  {
    pattern: '/temp',
    type: 'redirect',
    isPrerendered: true,
    entrypoint: '/temp',
    redirect: { status: 308, destination: '/about' },
    origin: 'project',
  },
  {
    pattern: '/null',
    type: 'page',
    isPrerendered: true,
    entrypoint: null,
    origin: 'project',
  },
  {
    pattern: '/_image',
    type: 'endpoint',
    isPrerendered: false,
    entrypoint: '../node_modules/astro/dist/assets/endpoint/dev.js',
    origin: 'internal',
  },
  {
    pattern: '/_external',
    type: 'page',
    isPrerendered: true,
    entrypoint: 'external.astro',
    origin: 'external',
  },
  {
    pattern: '/fallback',
    type: 'fallback',
    isPrerendered: true,
    entrypoint: 'fallback.astro',
    origin: 'project',
  },
];

test('routePath: строка и нестандартное значение', () => {
  assert.equal(routePath({ pattern: '/blog/[slug]' }), '/blog/[slug]');
  assert.equal(routePath({ pattern: 123 }), '123');
  assert.equal(routePath({}), '');
});

test('entrypointPath: относительный, абсолютный, URL, null', () => {
  assert.equal(entrypointPath('src/pages/index.astro', root), 'src/pages/index.astro');
  assert.equal(entrypointPath(path.join(root, 'src/pages/about.astro'), root), 'src/pages/about.astro');
  assert.equal(entrypointPath(pathToFileURL(path.join(root, 'src/pages/url.astro')), root), 'src/pages/url.astro');
  assert.equal(entrypointPath(null, root), null);
  assert.equal(entrypointPath(undefined, root), null);
});

test('getRedirectInfo: строка, объект, redirectRoute, отсутствие', () => {
  assert.deepEqual(getRedirectInfo({ redirect: '/new' }), {
    destination: '/new',
    status: 301,
  });
  assert.deepEqual(getRedirectInfo({ redirect: { status: 308, destination: '/about' } }), {
    destination: '/about',
    status: 308,
  });
  assert.deepEqual(getRedirectInfo({ redirect: { destination: '/about' } }), {
    destination: '/about',
    status: 301,
  });
  assert.deepEqual(getRedirectInfo({ redirectRoute: { pattern: '/target' } }), {
    destination: '/target',
    status: 301,
  });
  assert.equal(getRedirectInfo({}), null);
});

test('normalizeRoutes: только project-маршруты, сортировка и поля', () => {
  const data = normalizeRoutes(routes, { root });

  assert.deepEqual(
    data.map(r => r.route),
    ['/', '/about', '/api/health', '/null', '/old', '/temp']
  );
  assert.ok(data.every(r => r.origin === 'project'));

  const about = data.find(r => r.route === '/about');
  assert.equal(about.entrypoint, 'src/pages/about.astro');
  assert.equal(about.mode, 'static');

  const health = data.find(r => r.route === '/api/health');
  assert.equal(health.mode, 'server');

  const nullEntry = data.find(r => r.route === '/null');
  assert.equal(nullEntry.entrypoint, null);

  const oldRedirect = data.find(r => r.route === '/old');
  assert.equal(oldRedirect.destination, '/new');
  assert.equal(oldRedirect.status, 301);
  assert.equal(oldRedirect.entrypoint, null);

  const tempRedirect = data.find(r => r.route === '/temp');
  assert.equal(tempRedirect.destination, '/about');
  assert.equal(tempRedirect.status, 308);
});

test('normalizeRoutes: all включает internal/external, fallback остаётся вне списка', () => {
  const data = normalizeRoutes(routes, { root, all: true });
  const names = data.map(r => r.route);

  assert.equal(data.length, 8);
  assert.ok(names.includes('/_image'));
  assert.ok(names.includes('/_external'));
  assert.ok(!names.includes('/fallback'));
  assert.equal(data.find(r => r.route === '/_image').origin, 'internal');
});

test('normalizeRoutes: пустой вход', () => {
  assert.deepEqual(normalizeRoutes(null, { root }), []);
  assert.deepEqual(normalizeRoutes([], { root }), []);
});
