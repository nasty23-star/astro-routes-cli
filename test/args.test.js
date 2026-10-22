import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_TIMEOUT_MS,
  findAstroRoot,
  formatHelp,
  formatVersion,
  parseArgs,
  resolveRoot,
} from '../src/args.js';

function argv(...args) {
  return ['node', 'astro-routes.js', ...args];
}

test('parseArgs: значения по умолчанию', () => {
  assert.deepEqual(parseArgs(argv()), {
    json: false,
    all: false,
    output: null,
    root: null,
    timeout: DEFAULT_TIMEOUT_MS,
    noColor: false,
    verbose: false,
    version: false,
    help: false,
  });
});

test('parseArgs: длинные и короткие флаги', () => {
  const opts = parseArgs(argv(
    '--json', '--all', '--no-color', '--verbose',
    '-o', 'routes.json', '-r', '.', '-t', '1500'
  ));

  assert.equal(opts.json, true);
  assert.equal(opts.all, true);
  assert.equal(opts.noColor, true);
  assert.equal(opts.verbose, true);
  assert.equal(opts.output, 'routes.json');
  assert.equal(opts.root, '.');
  assert.equal(opts.timeout, 1500);
});

test('parseArgs: --output включает JSON', () => {
  assert.equal(parseArgs(argv('--output', 'routes.json')).json, true);
  assert.equal(parseArgs(argv('-o', 'routes.json')).json, true);
});

test('parseArgs: --version и --help', () => {
  assert.equal(parseArgs(argv('-v')).version, true);
  assert.equal(parseArgs(argv('--version')).version, true);
  assert.equal(parseArgs(argv('-h')).help, true);
  assert.equal(parseArgs(argv('--help')).help, true);
});

test('parseArgs: неверный timeout', () => {
  assert.throws(() => parseArgs(argv('--timeout', 'abc')), /--timeout/);
  assert.throws(() => parseArgs(argv('--timeout', '0')), /--timeout/);
  assert.throws(() => parseArgs(argv('--timeout', '-1')), /--timeout/);
});

test('parseArgs: пустой --output', () => {
  assert.throws(() => parseArgs(argv('--output=')), /--output/);
});

test('parseArgs: неизвестный флаг', () => {
  assert.throws(() => parseArgs(argv('--unknown')), /Unknown option/);
});

test('parseArgs: позиционные аргументы запрещены', () => {
  assert.throws(() => parseArgs(argv('extra')), /Unexpected argument/);
});

test('resolveRoot: существующий каталог и ошибки', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-routes-args-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(resolveRoot(dir), path.resolve(dir));
  assert.throws(() => resolveRoot(path.join(dir, 'missing')), /Каталог не найден/);

  const file = path.join(dir, 'file.txt');
  fs.writeFileSync(file, 'x');
  assert.throws(() => resolveRoot(file), /Каталог не найден/);
});

test('findAstroRoot: находит astro.config вверх по дереву', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-routes-root-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(dir, 'astro.config.mjs'), 'export default {}');
  const nested = path.join(dir, 'src', 'pages');
  fs.mkdirSync(nested, { recursive: true });

  assert.equal(findAstroRoot(nested), path.resolve(dir));
});

test('findAstroRoot: находит package.json с зависимостью astro', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-routes-root-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ dependencies: { astro: '^7.0.0' } })
  );
  const nested = path.join(dir, 'src', 'pages');
  fs.mkdirSync(nested, { recursive: true });

  assert.equal(findAstroRoot(nested), path.resolve(dir));
});

test('findAstroRoot: возвращает null, если проекта нет', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-routes-root-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(findAstroRoot(dir), null);
});

test('formatHelp и formatVersion', () => {
  const help = formatHelp();
  assert.match(help, /--root/);
  assert.match(help, /--no-color/);
  assert.match(help, /--verbose/);
  assert.match(help, /--timeout/);

  assert.match(formatVersion(), /^astro-routes-cli \d+\.\d+\.\d+$/);
});
