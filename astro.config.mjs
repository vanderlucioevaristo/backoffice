import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: { driver: sessionDrivers.memory() },
  security: { checkOrigin: true }, // proteção CSRF para POST de formulários
  devToolbar: { enabled: false },
});
