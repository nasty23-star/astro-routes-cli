import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [
    {
      name: 'fixture-hang',
      hooks: {
        'astro:config:setup': async () => {
          await new Promise(() => {});
        },
      },
    },
  ],
});
