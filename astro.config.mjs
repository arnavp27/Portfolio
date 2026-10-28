import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
export default defineConfig({
  integrations: [react()],
  trailingSlash: 'always',
  cacheDir: './.astro',
  vite: { cacheDir: './.vite' },
  devToolbar: { enabled: false },
});
