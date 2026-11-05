import { createWebServer } from './web.mjs';

// Feature: bind locally by default; a TLS reverse proxy or explicit HOST controls public deployment.
const port = Number(process.env.PORT ?? 8093);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const host = process.env.HOST ?? '127.0.0.1';
// Feature: require an explicit peer before enabling reverse proxy client address handling.
const server = await createWebServer({ trustedProxyIp: process.env.TRUSTED_PROXY_IP });
server.listen(port, host, () => console.log(`Little by Little website: http://${host}:${port}`));
// Feature: normal process shutdown closes the listener without leaving a background server behind.
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
