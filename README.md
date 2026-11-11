# Astro Routes Inspector

A CLI that lists the routes of an Astro project **without running a full build**: pages, endpoints, redirects, and their rendering mode (`static` / `server`).

## Features

- table or JSON output;
- project routes by default; `--all` includes internal/external routes;
- `--root` allows running from any directory;
- `--output` writes JSON atomically to a file;
- `--timeout` protects against a hung initialization;
- colors only in a TTY, with `--no-color` / `NO_COLOR` support.

## Requirements

- **Node.js 20.19+** for the CLI itself.
- **Astro 5+** in the target project. The Node version for Astro depends on Astro: Astro 7 requires Node 20.19+ or 22.12+.
- `astro` is resolved from the target project (`--root`, the current directory by default), not from the CLI's own dependencies.
- **Node 22+** is required for developing and testing this package. In the Windows sandbox, use `pnpm test:sandbox`.

## Installation

One-off run:

```bash
npx astro-routes-cli --help
# or
pnpm dlx astro-routes-cli --help
```

Locally in a project:

```bash
pnpm add -D astro-routes-cli
pnpm astro-routes --json
```

Globally:

```bash
pnpm add -g astro-routes-cli
astro-routes --help
```

From source:

```bash
pnpm install
node bin/astro-routes.js --root /path/to/astro-project
```

## Usage

Run from the root of an Astro project:

```bash
astro-routes
```

Or from any directory:

```bash
astro-routes --root ./apps/web
```

If `--root` is omitted, the CLI searches upward for the nearest `astro.config.*` or a `package.json` with an `astro` dependency and uses that directory.

### Options

| Option | Alias | Default | Description |
|---|---|---|---|
| `--json` | `-j` | off | Print JSON |
| `--output <file>` | `-o` | — | Write JSON to a file; implies `--json`; `-` means stdout |
| `--root <dir>` | `-r` | cwd / nearest Astro project | Astro project root |
| `--timeout <ms>` | `-t` | `60000` | Route collection timeout |
| `--all` | — | off | Also show `internal`/`external` routes |
| `--no-color` | — | off | Disable colors in the table |
| `--verbose` | — | off | Print a stack trace on errors |
| `--version` | `-v` | — | Print the version |
| `--help` | `-h` | — | Print help |

`--output` writes the file relative to the current directory, not `--root`. The parent directory must already exist.

## Examples

### Table

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

> CLI messages and summary labels are currently in Russian. JSON field names and values are in English.

In the table, long `route`, `entrypoint`, redirect, and fallback values are truncated with `…`; the full values are available in JSON.

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

### JSON to a file

```bash
astro-routes --output routes.json
```

The file is written atomically: first to a temporary file in the same directory, then renamed. A trailing `\n` is added.

### Internal routes

```bash
astro-routes --json --all
```

Astro's internal routes (`/_image`, `/_server-islands`, `/404`) and routes injected by integrations are hidden by default; `--all` shows them with their corresponding `"origin"`.

### i18n fallback

If Astro's `i18n.fallback` is configured, fallback routes are not duplicated in the main list; instead, they are attached to the source route in the `fallbacks` field:

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

In the table they are shown in a separate `↳ Fallback-маршруты` block, and `(+N fallback)` is appended to the summary. Identical paths and fallback routes from other origins are discarded by default; `--all` includes them as well.

Astro 5 does not yet expose `fallbackRoutes` through `astro:routes:resolved`, so the `fallbacks` field is absent there. Full support starts with Astro 6.

## Data format

| Field | Description |
|---|---|
| `route` | Readable route path (`/blog/[slug]`), not a RegExp |
| `type` | `page`, `endpoint`, or `redirect` |
| `mode` | `static` (prerendered) or `server` (SSR) |
| `entrypoint` | File path relative to the project root; `null` for redirects |
| `origin` | `project`, `internal`, or `external` |
| `destination` | Redirects only: the redirect target |
| `status` | Redirects only: HTTP status; `301` for string redirects |
| `fallbacks` | Optional array of i18n fallback routes: `route`, `type`, `mode`, `origin` |

Routes are sorted by `route`, then by `type`.

## How it works

1. The CLI resolves `astro` from `--root` via `createRequire(path.join(root, 'package.json'))`.
2. It runs `astro.build()` with a temporary `astro-routes-capture` integration.
3. In the `astro:routes:resolved` hook, the integration throws `RoutesCaptured` with the `ASTRO_ROUTES_CAPTURED` code.
4. The CLI catches **only** that error and returns the routes. The build is aborted before `content sync`, `astro:build:start`, and `astro:build:done`; no `dist` is created.

Important:

- `astro:config:setup` of user integrations still runs; it is part of config loading.
- `astro:config:done` and `astro:build:*` are **not** executed. This is intentional for an inspector.
- The inline integration is appended after user integrations, so their `astro:routes:resolved` hooks run first.
- The CLI sets `ASTRO_TELEMETRY_DISABLED=1` when the variable is not set: an inspector should not send telemetry.

## Timeout

`--timeout` limits route collection. It is implemented with `Promise.race`; when it fires, the CLI prints a message and exits with code 1, because `astro.build()` cannot be cancelled from the outside.

Limitation: the timer cannot interrupt synchronous Astro module import/parsing. A hard limit requires a child process.

## Errors and exit codes

- `0` — success, including an empty route list.
- `1` — invalid arguments, `astro` not found, file write error, timeout, or an Astro error.

With `--verbose`, an error also prints a stack trace.

If no routes are found, `--json` prints `[]`; the table prints `Маршруты не найдены.` ("No routes found.").

## Development

```bash
pnpm install
pnpm test          # CI and regular environments
pnpm test:sandbox  # Windows sandbox, where pipe/stdin cause EPERM
```

Tests:

- unit — arguments, normalization, redirects, entrypoints, table, JSON;
- e2e — a real Astro fixture: build, `--all`, `--output`, `--version`, timeout.

Fixtures: `test/fixtures/basic`, `test/fixtures/hang`, and `test/fixtures/i18n`.

In the Windows sandbox, `node --test` and `child_process` with pipes may fail with `EPERM`; `pnpm test:sandbox` therefore uses `--experimental-test-isolation=none`, and the e2e tests write stdout/stderr to file descriptors.

`.npmrc` enables `node-linker=hoisted`: on Windows + Node 24, pnpm's junction-based layout may fail to resolve the transitive `string-width` dependency of `cli-table3`.

### CI

The [.github/workflows/ci.yml](.github/workflows/ci.yml) workflow tests:

- Ubuntu + Node 22 + Astro 5, 6, 7;
- Windows + Node 24 + Astro 7.

Before running tests, CI installs the required Astro version via `pnpm add -D astro@<major>`. On Astro 5, the i18n fallback e2e test is skipped: `fallbackRoutes` are not yet exposed through `astro:routes:resolved`.

Node 18/20 and macOS are not part of the regular CI matrix to keep it small.

## License

ISC. See [LICENSE](LICENSE).
