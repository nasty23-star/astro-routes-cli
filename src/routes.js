import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORTED_TYPES = new Set(['page', 'endpoint', 'redirect']);

// В Astro 5+ IntegrationResolvedRoute.pattern — уже готовая строка маршрута.
export function routePath(route) {
  if (typeof route.pattern === 'string') return route.pattern;
  return String(route.pattern ?? '');
}

export function entrypointPath(entrypoint, root = process.cwd()) {
  if (entrypoint == null) return null;

  const value = entrypoint instanceof URL
    ? fileURLToPath(entrypoint)
    : String(entrypoint);

  const relative = path.isAbsolute(value) ? path.relative(root, value) : value;
  return relative.split(path.sep).join('/');
}

// Для строкового redirect Astro по умолчанию отдаёт 301.
export function getRedirectInfo(route) {
  const redirect = route.redirect;

  if (typeof redirect === 'string') {
    return { destination: redirect, status: 301 };
  }

  if (redirect && typeof redirect === 'object') {
    return {
      destination: redirect.destination ?? null,
      status: redirect.status ?? 301,
    };
  }

  if (route.redirectRoute?.pattern) {
    return { destination: route.redirectRoute.pattern, status: 301 };
  }

  return null;
}

export function normalizeRoutes(routes, { root = process.cwd(), all = false } = {}) {
  const validRoutes = (routes || []).filter(route => {
    const typeOk = SUPPORTED_TYPES.has(route.type);
    const originOk = all || (route.origin ?? 'project') === 'project';
    return typeOk && originOk;
  });

  const data = validRoutes.map(route => {
    const base = {
      route: routePath(route),
      type: route.type,
      mode: (route.isPrerendered ?? route.prerender) ? 'static' : 'server',
      entrypoint: entrypointPath(route.entrypoint, root),
      origin: route.origin ?? 'project',
    };

    if (route.type === 'redirect') {
      const info = getRedirectInfo(route);
      base.destination = info?.destination ?? null;
      base.status = info?.status ?? null;
      base.entrypoint = null;
    }

    return base;
  });

  data.sort((a, b) => a.route.localeCompare(b.route) || a.type.localeCompare(b.type));
  return data;
}
