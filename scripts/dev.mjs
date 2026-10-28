import { dev } from 'astro';
process.env.ASTRO_TELEMETRY_DISABLED ??= '1';
const server = await dev({ server: { host: '127.0.0.1', port: Number(process.env.PORT || 4173) } });
const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
