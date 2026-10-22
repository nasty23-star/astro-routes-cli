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

// ---------- Получение маршрутов ----------
async function collectRoutes({ useDev, timeoutMs = 60_000 }) {
  // Резолвим astro из целевого проекта (cwd), а не из папки инструмента
  const require = createRequire(process.cwd() + path.sep);
  const astroEntry = require.resolve('astro');
  const astro = await import(pathToFileURL(astroEntry).href);

  let capturedRoutes = null;
  let resolveRoutes;
  let rejectRoutes;
  const routesPromise = new Promise((resolve, reject) => {
    resolveRoutes = resolve;
    rejectRoutes = reject;
  });

  const capture = {
    name: 'astro-routes-capture',
    hooks: {
      'astro:routes:resolved': ({ routes }) => {
        if (capturedRoutes === null) {
          capturedRoutes = routes;
          resolveRoutes(routes);
        }
      },
    },
  };

  const timeout = setTimeout(() => {
    rejectRoutes(new Error(
      `Не удалось получить маршруты за ${timeoutMs} мс. ` +
      `Возможно, хук astro:routes:resolved не сработал (изменился API Astro?).`
    ));
  }, timeoutMs);

  let devServer = null;

  try {
    if (useDev && typeof astro.dev === 'function') {
      // Запускаем dev-сервер; хук сработает в процессе инициализации
      devServer = await astro.dev({
        root: process.cwd(),
        integrations: [capture],
        logLevel: 'silent',
      });
    } else {
      // Полная сборка; хук сработает в процессе
      await astro.build({
        root: process.cwd(),
        integrations: [capture],
        logLevel: 'silent',
      });
    }

    // Ждём, пока хук сохранит маршруты (или сработает таймаут)
    const routes = await routesPromise;
    return routes;
  } finally {
    clearTimeout(timeout);
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
  const maxRouteLength = Math.max(...data.map(r => r.route.length), 5);
  const table = new Table({
    head: ['ROUTE', 'TYPE', 'MODE'],
    colWidths: [Math.min(maxRouteLength + 5, 60), 15, 10],
    style: { head: ['cyan'], border: ['grey'] },
  });
  data.forEach(r => table.push([r.route, r.type, r.mode]));
  console.log('\n📋 Найденные маршруты:\n');
  console.log(table.toString());
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

  const validRoutes = (routes || []).filter(
    r => r.type === 'page' || r.type === 'endpoint'
  );

  const data = validRoutes.map(r => ({
    route: patternToString(r.pattern),
    type: r.type,
    mode: (r.isPrerendered || r.prerender) ? 'static' : 'server',
    entrypoint: r.entrypoint ? (r.entrypoint.pathname || r.entrypoint) : null,
  }));

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

