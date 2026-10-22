import { defineConfig } from 'astro/config';

export default defineConfig({
  i18n: {
    locales: ['en', 'ru'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: true },
    fallback: { ru: 'en' },
  },
});
