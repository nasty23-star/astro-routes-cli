#!/usr/bin/env node
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import Table from 'cli-table3';
import fs from 'node:fs';
import path from 'node:path';

// ---------- Парсинг аргументов ----------
function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    json: args.includes('--json'),
    dev: args.includes('--dev'),
    output: (() => {
      const i = args.indexOf('--output');
      return i !== -1 && args[i + 1] ? args[i + 1] : null;
    })(),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function printHelp() {
  console.log(`
Использование: astro-routes [опции]

Опции:
  --json              Вывести маршруты в формате JSON
  --output <file>     Сохранить JSON в файл (используется вместе с --json)
  --dev               Получить маршруты через dev-сервер (быстрее, без полной сборки)
  --help, -h          Показать эту справку
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

async function collectRoutes({ useDev }) {
  // Резолвим astro из целевого проекта (cwd), а не из папки инструмента
  const require = createRequire(process.cwd() + path.sep);
  const astroEntry = require.resolve('astro');
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
        root: process.cwd(),
        integrations: [capture],
        logLevel: 'silent',
      });
    } else {
      // Прерываем build до content sync и build:start
      await astro.build({
        root: process.cwd(),
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

function outputTable(data) {
  const routes = data.filter(r => r.type !== 'redirect'); // NEW: редиректы выводим отдельно
  const redirects = data.filter(r => r.type === 'redirect'); // NEW

  if (routes.length > 0) {
    const maxRouteLength = Math.max(...routes.map(r => r.route.length), 5);
    const entryPointLength = Math.max(...routes.map(r => r.entrypoint.length), 5);
    const table = new Table({
      head: ['ROUTE', 'TYPE', 'MODE', 'ENTRYPOINT'],
      colWidths: [Math.min(maxRouteLength + 5, 60), 15, 10, Math.min(entryPointLength + 15, 60)],
      style: { head: ['cyan'], border: ['grey'] },
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
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    return;
  }

  let routes;
  try {
    routes = await collectRoutes({ useDev: opts.dev });
  } catch (e) {
    console.error('Ошибка при получении маршрутов:', e.message);
    process.exit(1);
  }

  // NEW: включаем редиректы в фильтрацию
  const validRoutes = (routes || []).filter(
    r => r.type === 'page' || r.type === 'endpoint' || r.type === 'redirect'
  );

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
    outputTable(data);
  }
}

main().catch(e => {
  console.error('Непредвиденная ошибка:', e?.stack || e);
  process.exit(1);
});
