#!/usr/bin/env node

import { build } from 'astro';
import Table from 'cli-table3';

// Класс для прерывания сборки
class StopBuild extends Error {}

// Временная интеграция, чтобы вытащить маршруты
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
    // Запускаем программную сборку и сразу прерываем её
    await build({ 
      root: process.cwd(), 
      integrations: [capture],
      logLevel: 'silent' // чтобы не спамило логами сборки
    });
  } catch (e) {
    if (!(e instanceof StopBuild)) {
      console.error('Ошибка при получении маршрутов:', e);
      process.exit(1);
    }
  }

  const routes = globalThis.__routes || [];
  
  if (routes.length === 0) {
    console.log('Маршруты не найдены.');
    return;
  }

  // Фильтруем только нужные типы
  const validRoutes = routes.filter(r => r.type === 'page' || r.type === 'endpoint');

  // Вычисляем максимальную длину маршрута, чтобы таблица не ломалась
  const maxRouteLength = Math.max(
    ...validRoutes.map(r => r.pattern.toString().length), 
    5 // минимальная ширина для заголовка "ROUTE"
  );

  // Создаем красивую таблицу
  const table = new Table({
    head: ['ROUTE', 'TYPE', 'MODE'],
    colWidths: [Math.min(maxRouteLength + 5, 60), 15, 10], // Ограничиваем макс. ширину 60 символами
    style: {
      head: ['cyan'], 
      border: ['grey'],
    },
  });

  validRoutes.forEach(r => {
    const pattern = r.pattern.toString()
      .replace(/^\/\^/, '')
      .replace(/\$\/$/, '')
      .replace(/\\\//g, '/');
      
    const mode = (r.isPrerendered || r.prerender) ? 'static' : 'server';
    
    table.push([pattern, r.type, mode]);
  });

  console.log('\n📋 Найденные маршруты:\n');
  console.log(table.toString());
  console.log('\n');
}

main();