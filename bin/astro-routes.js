#!/usr/bin/env node
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseArgs as nodeParseArgs } from 'node:util';
import Table from 'cli-table3';
import fs from 'node:fs';
import path from 'node:path';

// ---------- Парсинг аргументов ----------
const DEFAULT_TIMEOUT_MS = 60_000;

function parseArgs(argv) {
  const { values } = nodeParseArgs({
    args: argv.slice(2),
    options: {
      json: { type: 'boolean', short: 'j' },
      dev: { type: 'boolean' },
      all: { type: 'boolean' },
      output: { type: 'string', short: 'o' },
      root: { type: 'string', short: 'r' },
      timeout: { type: 'string', short: 't' },
      'no-color': { type: 'boolean' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
  });

  if (values.output === '') {
    throw new Error('Опция --output требует путь к файлу.');
  }

  let timeout = DEFAULT_TIMEOUT_MS;
  if (values.timeout !== undefined) {
    const parsed = Number(values.timeout);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('Опция --timeout требует положительное число миллисекунд.');
    }
    timeout = parsed;
  }

  return {
    // --output неявно включает JSON: иначе файл молча не создавался бы
    json: Boolean(values.json) || values.output !== undefined,
    dev: Boolean(values.dev),
    all: Boolean(values.all),
    output: values.output ?? null,
    root: values.root ?? null,
    timeout,
    noColor: Boolean(values['no-color']),
    version: Boolean(values.version),
    help: Boolean(values.help),
  };
}

function resolveRoot(rootArg) {
  const root = path.resolve(rootArg ?? process.cwd());
  const stat = fs.statSync(root, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Каталог не найден: ${root}`);
  }
  return root;
}

function printVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  );
  console.log(`${pkg.name} ${pkg.version}`);
}

function printHelp() {
  console.log(`
Использование: astro-routes [опции]

Опции:
  -j, --json              Вывести маршруты в формате JSON
  -o, --output <file>     Сохранить JSON в файл (включает --json)
  -r, --root <dir>        Корень Astro-проекта (по умолчанию текущий каталог)
  -t, --timeout <ms>      Таймаут получения маршрутов (по умолчанию 60000)
      --dev               Получить маршруты через dev-сервер
      --all               Показать также internal/external маршруты
      --no-color          Отключить цвета в таблице
  -v, --version           Показать версию
  -h, --help              Показать эту справку
`);
}

// ---------- Преобразование pattern в читаемую строку ----------
function patternToString(pattern) {
  if (!pattern) return '';
  // pattern может быть RegExp или строкой (зависит от версии Astro)
  const raw = typeof pattern === 'string' ? pattern : pattern.toString();
  return raw
    .replace(/^\/\^/, '')
    .replace(/\$\/$/, '')
    .replace(/\\\//g, '/');
}

// NEW: извлечение информации о редиректе из маршрута
function getRedirectInfo(route) {
  // В Astro v5+ используется route.redirect.
  // Для совместимости со старыми версиями проверяем и redirectRoute.
  const redirect = route.redirect ?? route.redirectRoute;
  if (!redirect) return null;

  if (typeof redirect === 'string') {
    return { destination: redirect, status: null };
  }
  return {
    destination: redirect.destination ?? null,
    status: redirect.status ?? null,
  };
}

// ---------- Получение маршрутов ----------
// Собственная ошибка-сигнал: прерывает build/dev сразу после того,
// как Astro собрал манифест маршрутов, не давая сборке продолжиться.
class RoutesCaptured extends Error {
  constructor(routes) {
    super('Routes captured');
    this.name = 'RoutesCaptured';
    this.code = 'ASTRO_ROUTES_CAPTURED';
    this.routes = routes;
  }
}

// Отдельная ошибка таймаута: Astro build/dev нельзя отменить снаружи,
// поэтому main завершит процесс после сообщения.
class RoutesTimeoutError extends Error {
  constructor(timeoutMs) {
    super(
      `Не удалось получить маршруты за ${timeoutMs} мс. ` +
      `Возможно, зависла инициализация Astro. Увеличьте --timeout или проверьте конфиг.`
    );
    this.name = 'RoutesTimeoutError';
    this.code = 'ASTRO_ROUTES_TIMEOUT';
    this.timeoutMs = timeoutMs;
  }
}

async function collectRoutes({ root, useDev, timeoutMs = 60_000 }) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new RoutesTimeoutError(timeoutMs)), timeoutMs);
  });

  const collect = (async () => {
    // Резолвим astro из целевого проекта, а не из папки инструмента
    const require = createRequire(path.join(root, 'package.json'));
    let astroEntry;
    try {
      astroEntry = require.resolve('astro');
    } catch {
      throw new Error(
        `Не удалось найти astro в ${root}. ` +
        `Запустите CLI из корня Astro-проекта или укажите --root.`
      );
    }
    const astro = await import(pathToFileURL(astroEntry).href);

    let capturedRoutes = null;

    const capture = {
      name: 'astro-routes-capture',
      hooks: {
        'astro:routes:resolved': ({ routes }) => {
          if (capturedRoutes === null) {
            capturedRoutes = routes;
          }
          throw new RoutesCaptured(routes);
        },
      },
    };

    let devServer = null;

    try {
      if (useDev && typeof astro.dev === 'function') {
        // Прерываем инициализацию dev-сервера сразу после route discovery
        devServer = await astro.dev({
          root,
          integrations: [capture],
          logLevel: 'silent',
        });
      } else {
        // Прерываем build до content sync и build:start
        await astro.build({
          root,
          integrations: [capture],
          logLevel: 'silent',
        });
      }

      return capturedRoutes ?? [];
    } catch (error) {
      if (error instanceof RoutesCaptured || error?.code === 'ASTRO_ROUTES_CAPTURED') {
        return error.routes ?? capturedRoutes ?? [];
      }
      throw error;
    } finally {
      if (devServer && typeof devServer.stop === 'function') {
        await devServer.stop().catch(() => {});
      }
    }
  })();

  try {
    // Promise.race сам вешает обработчик на collect, поэтому после таймаута
    // поздний reject не станет unhandled rejection.
    return await Promise.race([collect, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Вывод ----------
function outputJson(data, outputPath) {
  const jsonString = JSON.stringify(data, null, 2);
  if (outputPath) {
    fs.writeFileSync(outputPath, jsonString, 'utf8');
    return;
  }
  console.log(jsonString);
}

function outputTable(data, { color = false } = {}) {
  const routes = data.filter(r => r.type !== 'redirect'); // NEW: редиректы выводим отдельно
  const redirects = data.filter(r => r.type === 'redirect'); // NEW

  if (routes.length > 0) {
    const maxRouteLength = Math.max(...routes.map(r => r.route.length), 5);
    const entryPointLength = Math.max(...routes.map(r => r.entrypoint.length), 5);
    const table = new Table({
      head: ['ROUTE', 'TYPE', 'MODE', 'ENTRYPOINT'],
      colWidths: [Math.min(maxRouteLength + 5, 60), 15, 10, Math.min(entryPointLength + 15, 60)],
      style: color ? { head: ['cyan'], border: ['grey'] } : {},
    });
    routes.forEach(r => table.push([r.route, r.type, r.mode, r.entrypoint]));
    console.log('\n📋 Найденные маршруты:\n');
    console.log(table.toString());
  }

  // NEW: отдельный блок для редиректов
  if (redirects.length > 0) {
    console.log('\n↪️  Редиректы:\n');
    redirects.forEach(r => {
      const status = r.status ? ` (${r.status})` : '';
      console.log(`  ${r.route} → ${r.destination}${status}`);
    });
  }

  console.log('\n');
}

// ---------- main ----------
async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv);
  } catch (error) {
    console.error(`Ошибка аргументов: ${error.message}`);
    console.error('Используйте --help для списка опций.');
    process.exitCode = 1;
    return;
  }

  if (opts.help) {
    printHelp();
    return;
  }

  if (opts.version) {
    printVersion();
    return;
  }

  let root;
  try {
    root = resolveRoot(opts.root);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  let routes;
  try {
    routes = await collectRoutes({ root, useDev: opts.dev, timeoutMs: opts.timeout });
  } catch (e) {
    if (e?.code === 'ASTRO_ROUTES_TIMEOUT') {
      // build/dev нельзя отменить снаружи — завершаем процесс принудительно
      console.error(e.message);
      process.exit(1);
    }
    console.error('Ошибка при получении маршрутов:', e.message);
    process.exitCode = 1;
    return;
  }

  // NEW: включаем редиректы в фильтрацию; по умолчанию только маршруты проекта
  const validRoutes = (routes || []).filter(r => {
    const typeOk = r.type === 'page' || r.type === 'endpoint' || r.type === 'redirect';
    const originOk = opts.all || (r.origin ?? 'project') === 'project';
    return typeOk && originOk;
  });

  const data = validRoutes.map(r => {
    const base = {
      route: patternToString(r.pattern),
      type: r.type,
      mode: (r.isPrerendered || r.prerender) ? 'static' : 'server',
      entrypoint: r.entrypoint ? (r.entrypoint.pathname || r.entrypoint) : null,
    };
    // NEW: для редиректов добавляем destination/status и убираем entrypoint
    if (r.type === 'redirect') {
      const info = getRedirectInfo(r);
      base.destination = info?.destination ?? null;
      base.status = info?.status ?? null;
      base.entrypoint = null;
    }
    return base;
  });

  const useColor = Boolean(process.stdout.isTTY)
    && !opts.noColor
    && process.env.NO_COLOR === undefined;

  try {
    if (data.length === 0) {
      if (opts.json) {
        outputJson([], opts.output);
      } else {
        console.log('Маршруты не найдены.');
      }
      return;
    }

    if (opts.json) {
      outputJson(data, opts.output);
    } else {
      outputTable(data, { color: useColor });
    }
  } catch (error) {
    console.error(`Не удалось записать результат: ${error.message}`);
    process.exitCode = 1;
  }
}

main().catch(e => {
  console.error('Непредвиденная ошибка:', e?.stack || e);
  process.exit(1);
});
