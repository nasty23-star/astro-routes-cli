import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Инспектор не должен отправлять telemetry Astro: это лишний side effect,
// а в песочницах запись в %APPDATA%\astro может падать с EPERM.
process.env.ASTRO_TELEMETRY_DISABLED ??= '1';

// Собственная ошибка-сигнал: прерывает build сразу после того,
// как Astro собрал манифест маршрутов, не давая сборке продолжиться.
export class RoutesCaptured extends Error {
  constructor(routes) {
    super('Routes captured');
    this.name = 'RoutesCaptured';
    this.code = 'ASTRO_ROUTES_CAPTURED';
    this.routes = routes;
  }
}

// Отдельная ошибка таймаута: Astro build нельзя отменить снаружи,
// поэтому main завершит процесс после сообщения.
export class RoutesTimeoutError extends Error {
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

export async function collectRoutes({ root, timeoutMs = 60_000 }) {
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

    try {
      // Прерываем build до content sync и build:start
      await astro.build({
        root,
        integrations: [capture],
        logLevel: 'silent',
      });

      return capturedRoutes ?? [];
    } catch (error) {
      if (error instanceof RoutesCaptured || error?.code === 'ASTRO_ROUTES_CAPTURED') {
        return error.routes ?? capturedRoutes ?? [];
      }
      throw error;
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
