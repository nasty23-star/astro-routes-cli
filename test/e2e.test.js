import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const astroMajor = Number(require('astro/package.json').version.split('.')[0]);

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const cli = path.join(repoRoot, 'bin', 'astro-routes.js');
const basic = path.join(repoRoot, 'test', 'fixtures', 'basic');
const hang = path.join(repoRoot, 'test', 'fixtures', 'hang');
const i18n = path.join(repoRoot, 'test', 'fixtures', 'i18n');

const artifactNames = [
  'dist',
  '.astro',
  'routes-hook.json',
  'build-start.txt',
  'build-done.txt',
];

function cleanFixture(dir) {
  for (const name of artifactNames) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

function runCli(args, { cwd = repoRoot, timeout = 120_000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-routes-e2e-'));
  const stdoutPath = path.join(dir, 'stdout.log');
  const stderrPath = path.join(dir, 'stderr.log');
  const stdoutFd = fs.openSync(stdoutPath, 'w');
  const stderrFd = fs.openSync(stderrPath, 'w');

  return new Promise(resolve => {
    let settled = false;
    let timedOut = false;

    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', NO_COLOR: '1' },
      // Файловые дескрипторы вместо pipe: в песочнице Windows pipe может дать EPERM
      stdio: ['ignore', stdoutFd, stderrFd],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      try {
        fs.closeSync(stdoutFd);
      } catch {
        // дескриптор мог быть уже закрыт
      }
      try {
        fs.closeSync(stderrFd);
      } catch {
        // дескриптор мог быть уже закрыт
      }

      const stdout = fs.readFileSync(stdoutPath, 'utf8');
      const stderr = fs.readFileSync(stderrPath, 'utf8');
      fs.rmSync(dir, { recursive: true, force: true });
      resolve({ code: timedOut ? 1 : code, stdout, stderr });
    };

    child.on('error', () => finish(1));
    child.on('close', (code) => finish(code ?? 1));
  });
}

beforeEach(() => {
  cleanFixture(basic);
  cleanFixture(hang);
  cleanFixture(i18n);
});

after(() => {
  cleanFixture(basic);
  cleanFixture(hang);
  cleanFixture(i18n);
});

test('e2e: build прерывается и отдаёт отсортированные project-маршруты', async () => {
  const result = await runCli(['--root', basic, '--json']);
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /PAGE RENDERED/);

  const routes = JSON.parse(result.stdout);
  assert.deepEqual(
    routes.map(r => r.route),
    ['/', '/about', '/api/health', '/blog/[slug]', '/old', '/old-temp']
  );
  assert.ok(routes.every(r => r.origin === 'project'));
  assert.equal(routes.find(r => r.route === '/old').status, 301);
  assert.equal(routes.find(r => r.route === '/old-temp').status, 302);
  assert.equal(routes.find(r => r.route === '/').entrypoint, 'src/pages/index.astro');

  assert.equal(fs.existsSync(path.join(basic, 'dist')), false);
  assert.equal(fs.existsSync(path.join(basic, 'build-start.txt')), false);
  assert.equal(fs.existsSync(path.join(basic, 'build-done.txt')), false);
});

test('e2e: --dev даёт project-маршруты, --all добавляет internal', async () => {
  const project = await runCli(['--root', basic, '--dev', '--json']);
  assert.equal(project.code, 0, project.stderr);
  const projectRoutes = JSON.parse(project.stdout);
  assert.equal(projectRoutes.length, 6);
  assert.ok(!projectRoutes.some(r => r.route === '/_image'));

  const all = await runCli(['--root', basic, '--dev', '--json', '--all']);
  assert.equal(all.code, 0, all.stderr);
  const allRoutes = JSON.parse(all.stdout);
  assert.equal(allRoutes.length, 9);
  assert.ok(allRoutes.some(r => r.route === '/_image' && r.origin === 'internal'));
});

test(
  'e2e: i18n fallback-маршруты попадают в поле fallbacks',
  { skip: astroMajor < 6 ? 'Astro 5 не отдаёт fallbackRoutes через astro:routes:resolved' : false },
  async () => {
    const result = await runCli(['--root', i18n, '--json']);
    assert.equal(result.code, 0, result.stderr);

    const routes = JSON.parse(result.stdout);
    assert.deepEqual(routes.map(r => r.route), ['/en', '/en/about']);

    assert.deepEqual(routes.find(r => r.route === '/en/about').fallbacks, [
      {
        route: '/ru/about',
        type: 'fallback',
        mode: 'static',
        origin: 'project',
      },
    ]);
    assert.deepEqual(routes.find(r => r.route === '/en').fallbacks, [
      {
        route: '/ru',
        type: 'fallback',
        mode: 'static',
        origin: 'project',
      },
    ]);
  }
);

test('e2e: --output без --json пишет JSON в файл', async (t) => {
  const target = path.join(
    os.tmpdir(),
    `astro-routes-e2e-${process.pid}-${Date.now()}.json`
  );
  t.after(() => fs.rmSync(target, { force: true }));

  const result = await runCli(['--root', basic, '--output', target]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');

  const content = fs.readFileSync(target, 'utf8');
  assert.ok(content.endsWith('\n'));
  const routes = JSON.parse(content);
  assert.equal(routes.length, 6);
});

test('e2e: --version и --help не запускают Astro', async () => {
  const version = await runCli(['--version']);
  assert.equal(version.code, 0, version.stderr);
  assert.match(version.stdout, /^astro-routes-cli \d+\.\d+\.\d+\n$/);

  const help = await runCli(['--help']);
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /--root/);
  assert.match(help.stdout, /--no-color/);
});

test('e2e: неизвестный флаг и неверный --timeout дают exit 1', async () => {
  const unknown = await runCli(['--unknown']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /Ошибка аргументов/);

  const timeout = await runCli(['--timeout', 'abc']);
  assert.equal(timeout.code, 1);
  assert.match(timeout.stderr, /--timeout/);
});

test('e2e: --verbose печатает stack trace', async () => {
  const result = await runCli(['--root', '.missing', '--verbose']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /at resolveRoot/);
});

test('e2e: timeout на зависшем config:setup, без unhandled rejection', async () => {
  const result = await runCli(
    ['--root', hang, '--json', '--timeout', '500'],
    { timeout: 30_000 }
  );

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Не удалось получить маршруты за 500 мс/);
  assert.doesNotMatch(result.stderr, /Unhandled|ERR_UNHANDLED/);
});
