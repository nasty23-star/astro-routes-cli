import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { formatJson, formatTable, writeJson } from '../src/render.js';

const data = [
  {
    route: '/',
    type: 'page',
    mode: 'static',
    entrypoint: 'src/pages/index.astro',
    origin: 'project',
  },
  {
    route: '/blog/[slug]',
    type: 'page',
    mode: 'static',
    entrypoint: 'src/pages/blog/[slug].astro',
    origin: 'project',
    fallbacks: [
      {
        route: '/ru/blog/[slug]',
        type: 'fallback',
        mode: 'static',
        origin: 'project',
      },
    ],
  },
  {
    route: '/api/health',
    type: 'endpoint',
    mode: 'server',
    entrypoint: null,
    origin: 'project',
  },
  {
    route: '/old',
    type: 'redirect',
    mode: 'static',
    entrypoint: null,
    origin: 'project',
    destination: '/new',
    status: 301,
  },
  {
    route: '/_image',
    type: 'endpoint',
    mode: 'server',
    entrypoint: '../node_modules/astro/dist/assets/endpoint/dev.js',
    origin: 'internal',
  },
];

test('formatTable: summary, ORIGIN, null entrypoint и redirect status', () => {
  const text = formatTable(data, { columns: 80 });

  assert.ok(!text.includes('\u001b['), 'в таблице не должно быть ANSI');
  assert.match(text, /Итого: 5/);
  assert.match(text, /ORIGIN/);
  assert.match(text, /—/);
  assert.match(text, /\/old → \/new \(301\)/);
  assert.match(text, /↳ Fallback-маршруты/);
  assert.match(text, /\/blog\/\[slug\] → \/ru\/blog\/\[slug\] \(static\)/);
  assert.match(text, /\(\+1 fallback\)/);

  for (const line of text.split('\n')) {
    assert.ok(line.length <= 80, `строка длиннее 80 колонок (${line.length}): ${line}`);
  }
});

test('formatTable: длинные значения обрезаются, таблица влезает в 100 колонок', () => {
  const longData = [
    {
      route: `/${'very-long-route/'.repeat(5)}`,
      type: 'page',
      mode: 'static',
      entrypoint: `src/pages/${'very-long-path/'.repeat(5)}index.astro`,
      origin: 'project',
    },
  ];

  const text = formatTable(longData, { columns: 100 });

  assert.match(text, /…/);
  for (const line of text.split('\n')) {
    assert.ok(line.length <= 100, `строка длиннее 100 колонок (${line.length}): ${line}`);
  }
});

test('formatTable: 60 колонок и длинные fallback/redirect обрезаются', () => {
  const longPath = `/${'very-long-segment/'.repeat(8)}`;
  const narrowData = [
    {
      route: `/${'route/'.repeat(10)}`,
      type: 'page',
      mode: 'static',
      entrypoint: `src/${'path/'.repeat(10)}index.astro`,
      origin: 'internal',
      fallbacks: [
        {
          route: `/ru/${'fallback/'.repeat(10)}`,
          type: 'fallback',
          mode: 'static',
          origin: 'project',
        },
      ],
    },
    {
      route: '/old',
      type: 'redirect',
      mode: 'static',
      entrypoint: null,
      origin: 'project',
      destination: longPath,
      status: 301,
    },
  ];

  const text = formatTable(narrowData, { columns: 60 });

  for (const line of text.split('\n')) {
    assert.ok(line.length <= 60, `строка длиннее 60 колонок (${line.length}): ${line}`);
  }
  assert.match(text, /…/);
  assert.match(text, /↪️  Редиректы/);
  assert.match(text, /↳ Fallback-маршруты/);
});

test('formatTable: пустой список не падает', () => {
  const text = formatTable([], { columns: 80 });
  assert.match(text, /Итого: 0/);
});

test('formatJson: завершающий перевод строки и валидный JSON', () => {
  const json = formatJson([{ route: '/' }]);
  assert.ok(json.endsWith('\n'));
  assert.deepEqual(JSON.parse(json), [{ route: '/' }]);
});

test('writeJson: атомарная запись, перезапись и отсутствие temp-файлов', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-routes-render-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const target = path.join(dir, 'routes.json');
  writeJson(data, target);

  const first = fs.readFileSync(target, 'utf8');
  assert.ok(first.endsWith('\n'));
  assert.equal(JSON.parse(first).length, data.length);

  writeJson([{ route: '/only' }], target);
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), [{ route: '/only' }]);

  const tempFiles = fs.readdirSync(dir).filter(name => name.endsWith('.tmp'));
  assert.deepEqual(tempFiles, []);
});

test('writeJson: stdout для null и "-"', () => {
  const chunks = [];
  const stdout = { write: (chunk) => chunks.push(chunk) };

  writeJson([{ route: '/' }], null, { stdout });
  writeJson([{ route: '/x' }], '-', { stdout });

  assert.equal(
    chunks.join(''),
    formatJson([{ route: '/' }]) + formatJson([{ route: '/x' }])
  );
});
