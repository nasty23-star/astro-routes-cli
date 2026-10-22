# Astro Routes Inspector

CLI-утилита для получения списка маршрутов Astro-проекта **без полной сборки**: страницы, endpoints, redirects и их режим (`static` / `server`).

## Возможности

- таблица или JSON;
- project-маршруты по умолчанию, `--all` — вместе с internal/external;
- `--all` — вместе с internal/external;
- `--root` — запуск из любого каталога;
- `--output` — атомарная запись JSON в файл;
- `--timeout` — защита от зависшей инициализации;
- цвета только в TTY, с поддержкой `--no-color` / `NO_COLOR`.

## Требования

- **Node.js 18.17+** для самого CLI.
- **Astro 5+** в целевом проекте. Версия Node для Astro зависит от Astro: Astro 7 требует Node 20.19+ или 22.12+.
- `astro` резолвится из целевого проекта (`--root`, по умолчанию текущий каталог), а не из зависимостей CLI.
- Для разработки и тестов этого пакета нужен **Node 22.8+** (используется `--test-isolation=none`).

## Установка

Разовый запуск:

```bash
npx astro-routes-cli --help
# или
pnpm dlx astro-routes-cli --help
```

Локально в проект:

```bash
pnpm add -D astro-routes-cli
pnpm astro-routes --json
```

Глобально:

```bash
pnpm add -g astro-routes-cli
astro-routes --help
```

Из исходников:

```bash
pnpm install
node bin/astro-routes.js --root /path/to/astro-project
```

## Использование

Запускать из корня Astro-проекта:

```bash
astro-routes
```

Либо из любого каталога:

```bash
astro-routes --root ./apps/web
```

Если `--root` не указан, CLI ищет ближайший `astro.config.*` или `package.json` с зависимостью `astro` вверх по дереву и использует этот каталог.

### Опции

| Опция | Алиас | По умолчанию | Описание |
|---|---|---|---|
| `--json` | `-j` | выкл | Вывести JSON |
| `--output <file>` | `-o` | — | Записать JSON в файл; неявно включает `--json`; `-` — stdout |
| `--root <dir>` | `-r` | cwd / ближайший Astro-проект | Корень Astro-проекта |
| `--timeout <ms>` | `-t` | `60000` | Таймаут получения маршрутов |
| `--all` | — | выкл | Показать также `internal`/`external` маршруты |
| `--no-color` | — | выкл | Отключить цвета в таблице |
| `--verbose` | — | выкл | Показывать stack trace при ошибках |
| `--version` | `-v` | — | Показать версию |
| `--help` | `-h` | — | Показать справку |

`--output` пишет файл относительно текущего каталога, а не `--root`. Родительский каталог должен существовать.

## Примеры

### Таблица

```bash
astro-routes
```

```text
📋 Найденные маршруты (6):

┌──────────────┬──────────┬────────┬─────────────────────────────┐
│ ROUTE        │ TYPE     │ MODE   │ ENTRYPOINT                  │
├──────────────┼──────────┼────────┼─────────────────────────────┤
│ /            │ page     │ static │ src/pages/index.astro       │
│ /about       │ page     │ static │ src/pages/about.astro       │
│ /api/health  │ endpoint │ server │ src/pages/api/health.ts     │
│ /blog/[slug] │ page     │ static │ src/pages/blog/[slug].astro │
└──────────────┴──────────┴────────┴─────────────────────────────┘

↪️  Редиректы:

  /old → /new (301)

Итого: 6 — page: 3, endpoint: 1, redirect: 2
```

В таблице длинные `route`, `entrypoint`, redirects и fallback-маршруты обрезаются с `…`; полные значения есть в JSON.

### JSON

```bash
astro-routes --json
```

```json
[
  {
    "route": "/blog/[slug]",
    "type": "page",
    "mode": "static",
    "entrypoint": "src/pages/blog/[slug].astro",
    "origin": "project"
  },
  {
    "route": "/old",
    "type": "redirect",
    "mode": "static",
    "entrypoint": null,
    "origin": "project",
    "destination": "/new",
    "status": 301
  }
]
```

### JSON в файл

```bash
astro-routes --output routes.json
```

Файл пишется атомарно: сначала во временный файл рядом, затем `rename`. В конце добавляется `\n`.

### Internal-маршруты

```bash
astro-routes --json --all
```

Внутренние маршруты Astro (`/_image`, `/_server-islands`, `/404`) и injected-маршруты интеграций по умолчанию скрыты; `--all` показывает их с соответствующим `"origin"`.

### i18n fallback

Если в Astro настроен `i18n.fallback`, fallback-маршруты не дублируются в общем списке, а добавляются к исходному маршруту полем `fallbacks`:

```json
{
  "route": "/en/about",
  "type": "page",
  "mode": "static",
  "entrypoint": "src/pages/en/about.astro",
  "origin": "project",
  "fallbacks": [
    {
      "route": "/ru/about",
      "type": "fallback",
      "mode": "static",
      "origin": "project"
    }
  ]
}
```

В таблице они выводятся отдельным блоком `↳ Fallback-маршруты`, а в summary добавляется `(+N fallback)`. Одинаковые пути и fallback-маршруты других origin по умолчанию отбрасываются; `--all` включает и их.

В Astro 5 `fallbackRoutes` ещё не отдаются через `astro:routes:resolved`, поэтому поле `fallbacks` там отсутствует. Полноценная поддержка — Astro 6+.

## Формат данных

| Поле | Описание |
|---|---|
| `route` | Читаемый путь маршрута (`/blog/[slug]`), не RegExp |
| `type` | `page`, `endpoint` или `redirect` |
| `mode` | `static` (пререндерится) или `server` (SSR) |
| `entrypoint` | Путь к файлу относительно корня проекта; `null` для redirect |
| `origin` | `project`, `internal` или `external` |
| `destination` | Только для redirect: куда ведёт |
| `status` | Только для redirect: HTTP-статус; для строкового redirect — `301` |
| `fallbacks` | Необязательный массив i18n fallback-маршрутов: `route`, `type`, `mode`, `origin` |

Маршруты сортируются по `route`, затем по `type`.

## Как это работает

1. CLI резолвит `astro` из `--root` через `createRequire(path.join(root, 'package.json'))`.
2. Запускается `astro.build()` с временной интеграцией `astro-routes-capture`.
3. В хуке `astro:routes:resolved` интеграция бросает `RoutesCaptured` с кодом `ASTRO_ROUTES_CAPTURED`.
4. CLI ловит **только** эту ошибку и возвращает маршруты. Сборка прерывается до `content sync`, `astro:build:start` и `astro:build:done`; `dist` не создаётся.

Важно:

- `astro:config:setup` пользовательских интеграций всё равно выполняется — это часть загрузки конфига.
- `astro:config:done` и `astro:build:*` **не** выполняются. Для инспектора это осознанное поведение.
- Inline-интеграция добавляется после пользовательских, поэтому их `astro:routes:resolved` успевают выполниться.
- CLI выставляет `ASTRO_TELEMETRY_DISABLED=1`, если переменная не задана: инспектор не должен отправлять telemetry.

## Таймаут

`--timeout` ограничивает получение маршрутов. Реализация — `Promise.race`; при срабатывании CLI печатает сообщение и завершается с кодом 1, потому что `astro.build()` нельзя отменить снаружи.

Ограничение: таймер не может прервать синхронный импорт/парсинг модулей Astro. Для жёсткого лимита нужен дочерний процесс.

## Ошибки и коды выхода

- `0` — успех, в том числе пустой список маршрутов.
- `1` — ошибка аргументов, `astro` не найден, ошибка записи файла, таймаут или ошибка Astro.

С `--verbose` при ошибке дополнительно печатается stack trace.

Если маршрутов нет: в `--json` печатается `[]`, в таблице — `Маршруты не найдены.`

## Разработка

```bash
pnpm install
pnpm test
```

Тесты:

- unit — аргументы, нормализация, redirect, entrypoint, таблица, JSON;
- e2e — реальный Astro fixture: build, `--all`, `--output`, `--version`, timeout.

Fixtures: `test/fixtures/basic`, `test/fixtures/hang` и `test/fixtures/i18n`.

В Windows-песочнице `node --test` и `child_process` с pipe могут падать с `EPERM`; поэтому тесты запускаются с `--test-isolation=none`, а e2e пишет stdout/stderr в файловые дескрипторы.

`.npmrc` включает `node-linker=hoisted`: на Windows + Node 24 pnpm-раскладка с junction-ссылками может не резолвить транзитивный `string-width` у `cli-table3`.

### CI

Workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) проверяет:

- Ubuntu + Node 22 + Astro 5, 6, 7;
- Windows + Node 24 + Astro 7.

Перед тестами CI ставит нужную версию Astro через `pnpm add -D astro@<major>`. На Astro 5 e2e-тест i18n fallback пропускается: там `fallbackRoutes` ещё не отдаются через `astro:routes:resolved`.

Node 18/20 и macOS в обычный CI не входят, чтобы не раздувать матрицу.

План работ, известные ошибки и чек-листы — в [TODO.md](TODO.md).
