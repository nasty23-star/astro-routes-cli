import fs from 'node:fs';
import path from 'node:path';
import Table from 'cli-table3';

export function formatJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function writeJson(data, outputPath, { stdout = process.stdout } = {}) {
  const jsonString = formatJson(data);

  if (!outputPath || outputPath === '-') {
    stdout.write(jsonString);
    return;
  }

  const target = path.resolve(outputPath);
  const dir = path.dirname(target);
  const temp = path.join(
    dir,
    `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`
  );

  try {
    fs.writeFileSync(temp, jsonString, 'utf8');
    fs.renameSync(temp, target);
  } catch (error) {
    try {
      fs.unlinkSync(temp);
    } catch {
      // временный файл мог не создаться
    }
    throw error;
  }
}

export function formatTable(data, { color = false, columns } = {}) {
  const routes = data.filter(r => r.type !== 'redirect');
  const redirects = data.filter(r => r.type === 'redirect');
  const chunks = [];

  if (routes.length > 0) {
    const showOrigin = routes.some(r => r.origin && r.origin !== 'project');
    const terminalWidth = Math.max(columns || process.stdout.columns || 100, 60);
    const columnCount = showOrigin ? 5 : 4;
    // cli-table3 добавляет рамки/паддинги сверх суммы colWidths
    const available = Math.max(terminalWidth - columnCount - 2, 40);
    const typeWidth = 10;
    const modeWidth = 8;
    const originWidth = showOrigin ? 10 : 0;
    const remaining = Math.max(available - typeWidth - modeWidth - originWidth, 30);

    const maxRouteLength = Math.max(
      ...routes.map(r => r.route.length),
      'ROUTE'.length
    );
    const maxEntryLength = Math.max(
      ...routes.map(r => (r.entrypoint ?? '—').length),
      'ENTRYPOINT'.length
    );

    let routeWidth = Math.min(
      Math.max(maxRouteLength + 2, 12),
      Math.max(12, Math.floor(remaining * 0.4))
    );
    let entryWidth = Math.max(remaining - routeWidth, 12);
    if (entryWidth > maxEntryLength + 2) {
      const spare = entryWidth - (maxEntryLength + 2);
      entryWidth = maxEntryLength + 2;
      routeWidth = Math.min(routeWidth + spare, maxRouteLength + 2);
    }

    const head = showOrigin
      ? ['ROUTE', 'TYPE', 'MODE', 'ORIGIN', 'ENTRYPOINT']
      : ['ROUTE', 'TYPE', 'MODE', 'ENTRYPOINT'];
    const colWidths = showOrigin
      ? [routeWidth, typeWidth, modeWidth, originWidth, entryWidth]
      : [routeWidth, typeWidth, modeWidth, entryWidth];

    const table = new Table({
      head,
      colWidths,
      style: color ? { head: ['cyan'], border: ['grey'] } : { head: [], border: [] },
    });

    routes.forEach(r => {
      const row = [r.route, r.type, r.mode];
      if (showOrigin) row.push(r.origin);
      row.push(r.entrypoint ?? '—');
      table.push(row);
    });

    chunks.push('', `📋 Найденные маршруты (${data.length}):`, '', table.toString());
  }

  if (redirects.length > 0) {
    chunks.push(
      '',
      '↪️  Редиректы:',
      '',
      ...redirects.map(r => {
        const status = r.status ? ` (${r.status})` : '';
        return `  ${r.route} → ${r.destination}${status}`;
      })
    );
  }

  const counts = data.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {});
  const parts = Object.entries(counts).map(([type, count]) => `${type}: ${count}`);
  chunks.push('', `Итого: ${data.length}${parts.length ? ` — ${parts.join(', ')}` : ''}`, '');

  return `${chunks.join('\n')}\n`;
}
