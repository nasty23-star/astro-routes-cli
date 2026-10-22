#!/usr/bin/env node

import { build } from 'astro';
import Table from 'cli-table3';
import fs from 'fs';

class StopBuild extends Error {}

const capture = {
  name: 'astro-routes-capture',
  hooks: {
    'astro:routes:resolved': ({ routes }) => {
      globalThis.__routes = routes;
      throw new StopBuild();
    },
  },
};

async function main() {
  try {
    await build({ 
      root: process.cwd(), 
      integrations: [capture],
      logLevel: 'silent' 
    });
  } catch (e) {
    if (!(e instanceof StopBuild)) {
      console.error('Ошибка при получении маршрутов:', e.message);
      process.exit(1);
    }
  }

  const routes = globalThis.__routes || [];
  const validRoutes = routes.filter(r => r.type === 'page' || r.type === 'endpoint');

  if (validRoutes.length === 0) {
    if (process.argv.includes('--json')) console.log('[]');
    else console.log('Маршруты не найдены.');
    return;
  }

  // Формируем массив данных
  const data = validRoutes.map(r => ({
    route: r.pattern.toString().replace(/^\/\^/, '').replace(/\$\/$/, '').replace(/\\\//g, '/'),
    type: r.type,
    mode: (r.isPrerendered || r.prerender) ? 'static' : 'server',
    entrypoint: r.entrypoint ? r.entrypoint.pathname || r.entrypoint : null
  }));

  // Проверка на JSON
  if (process.argv.includes('--json')) {
    const jsonString = JSON.stringify(data, null, 2);
    
    // Проверка на сохранение в файл
    const outputIndex = process.argv.indexOf('--output');
    if (outputIndex !== -1 && process.argv[outputIndex + 1]) {
      fs.writeFileSync(process.argv[outputIndex + 1], jsonString);
      return;
    }
    
    console.log(jsonString);
    return;
  }

  // Вывод таблицы
  const maxRouteLength = Math.max(...data.map(r => r.route.length), 5);
  const table = new Table({
    head: ['ROUTE', 'TYPE', 'MODE'],
    colWidths: [Math.min(maxRouteLength + 5, 60), 15, 10],
    style: { head: ['cyan'], border: ['grey'] }
  });

  data.forEach(r => table.push([r.route, r.type, r.mode]));
  console.log('\n📋 Найденные маршруты:\n');
  console.log(table.toString());
  console.log('\n');
}

main();
