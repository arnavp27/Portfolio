import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { publicSite } from './src/lib/site.ts';
export default defineConfig({
  site: publicSite(process.env.PUBLIC_SITE_URL)?.href,
  integrations: [react()],
  trailingSlash: 'always',
  cacheDir: './.astro',
  vite: { cacheDir: './.vite' },
  devToolbar: { enabled: false },
});
