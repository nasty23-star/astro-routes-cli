import fs from 'node:fs';
import path from 'node:path';
import { parseArgs as nodeParseArgs } from 'node:util';

export const DEFAULT_TIMEOUT_MS = 60_000;

export function parseArgs(argv) {
  const { values } = nodeParseArgs({
    args: argv.slice(2),
    options: {
      json: { type: 'boolean', short: 'j' },
      all: { type: 'boolean' },
      output: { type: 'string', short: 'o' },
      root: { type: 'string', short: 'r' },
      timeout: { type: 'string', short: 't' },
      'no-color': { type: 'boolean' },
      verbose: { type: 'boolean' },
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
    all: Boolean(values.all),
    output: values.output ?? null,
    root: values.root ?? null,
    timeout,
    noColor: Boolean(values['no-color']),
    verbose: Boolean(values.verbose),
    version: Boolean(values.version),
    help: Boolean(values.help),
  };
}

const ASTRO_CONFIG_NAMES = [
  'astro.config.mjs',
  'astro.config.js',
  'astro.config.cjs',
  'astro.config.ts',
  'astro.config.mts',
  'astro.config.cts',
];

function hasAstroDependency(dir) {
  const packagePath = path.join(dir, 'package.json');
  if (!fs.existsSync(packagePath)) return false;

  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return Boolean(
      pkg.dependencies?.astro ||
      pkg.devDependencies?.astro ||
      pkg.peerDependencies?.astro
    );
  } catch {
    return false;
  }
}

export function findAstroRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);

  while (true) {
    if (ASTRO_CONFIG_NAMES.some(name => fs.existsSync(path.join(dir, name)))) {
      return dir;
    }
    if (hasAstroDependency(dir)) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function resolveRoot(rootArg) {
  const explicit = rootArg != null;
  const root = explicit
    ? path.resolve(rootArg)
    : (findAstroRoot(process.cwd()) ?? path.resolve(process.cwd()));

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
  -r, --root <dir>        Корень Astro-проекта (по умолчанию cwd или ближайший Astro-проект вверх)
  -t, --timeout <ms>      Таймаут получения маршрутов (по умолчанию 60000)
      --all               Показать также internal/external маршруты
      --no-color          Отключить цвета в таблице
      --verbose           Показывать stack trace при ошибках
  -v, --version           Показать версию
  -h, --help              Показать эту справку
`;
}
