import fs from 'node:fs';
import path from 'node:path';
import { parseArgs as nodeParseArgs } from 'node:util';

export const DEFAULT_TIMEOUT_MS = 60_000;

export function parseArgs(argv) {
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

export function resolveRoot(rootArg) {
  const root = path.resolve(rootArg ?? process.cwd());
  const stat = fs.statSync(root, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Каталог не найден: ${root}`);
  }
  return root;
}

export function formatVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  );
  return `${pkg.name} ${pkg.version}`;
}

export function formatHelp() {
  return `
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
`;
}
