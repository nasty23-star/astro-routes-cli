#!/usr/bin/env node
import { formatHelp, formatVersion, parseArgs, resolveRoot } from '../src/args.js';
import { collectRoutes } from '../src/collect.js';
import { formatTable, writeJson } from '../src/render.js';
import { normalizeRoutes } from '../src/routes.js';

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
    process.stdout.write(formatHelp());
    return;
  }

  if (opts.version) {
    process.stdout.write(`${formatVersion()}\n`);
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

  const data = normalizeRoutes(routes, { root, all: opts.all });
  const useColor = Boolean(process.stdout.isTTY)
    && !opts.noColor
    && process.env.NO_COLOR === undefined;

  try {
    if (data.length === 0) {
      if (opts.json) {
        writeJson([], opts.output);
      } else {
        console.log('Маршруты не найдены.');
      }
      return;
    }

    if (opts.json) {
      writeJson(data, opts.output);
    } else {
      process.stdout.write(formatTable(data, { color: useColor }));
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
