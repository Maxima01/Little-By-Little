import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { isIP } from 'node:net';
import { pipeline } from 'node:stream/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const TYPES = {
  '.json': 'application/json; charset=utf-8', '.exe': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

// Feature: canonicalize IP literals so alternate IPv6 spellings use the same request budget.
function canonicalIp(address) {
  if (typeof address !== 'string' || address.includes('%')) return null;
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return null;
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(normalized);
  if (!mapped) return normalized;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

// Feature: cap request volume and limiter memory without trusting spoofable forwarding headers.
export function createRequestGate({ burst = 120, perSecond = 2, maxClients = 2048, now = () => performance.now() } = {}) {
  if (!Number.isInteger(burst) || burst < 1 || burst > 10_000
    || !Number.isFinite(perSecond) || perSecond <= 0 || perSecond > 1_000
    || !Number.isInteger(maxClients) || maxClients < 1 || maxClients > 8192) {
    throw new Error('Invalid request volume limits.');
  }
  const clients = new Map();
  const idleTime = Math.max(60_000, burst / perSecond * 2_000);
  const shared = { tokens: 600, updated: now() };
  let lastSweep = -Infinity;
  // Refill with a monotonic clock; blocked requests do not allocate beyond the bounded peer table.
  return (peer) => {
    const time = now();
    shared.tokens = Math.min(600, shared.tokens + Math.max(0, time - shared.updated) * 30 / 1_000);
    shared.updated = time;
    let client = clients.get(peer);
    if (!client) {
      if (clients.size >= maxClients) {
        if (time - lastSweep >= 1_000) {
          for (const [address, entry] of clients) if (time - entry.updated >= idleTime) clients.delete(address);
          lastSweep = time;
        }
        if (clients.size >= maxClients) return Math.ceil(idleTime / 1_000);
      }
      client = { tokens: burst, updated: time };
      clients.set(peer, client);
    }
    client.tokens = Math.min(burst, client.tokens + Math.max(0, time - client.updated) * perSecond / 1_000);
    client.updated = time;
    if (client.tokens < 1 || shared.tokens < 1) {
      return Math.max(1, Math.ceil(Math.max((1 - client.tokens) / perSecond, (1 - shared.tokens) / 30)));
    }
    client.tokens -= 1;
    shared.tokens -= 1;
    return 0;
  };
}

// Feature: an exact provider origin bounds network access; public settings never accept credentials or paths.
export function contentSecurityPolicy(supabaseUrl, turnstileSiteKey = '') {
  const connections = ["'self'", 'https://freedictionaryapi.com', 'https://api.dictionaryapi.dev', 'https://api.datamuse.com'];
  if (supabaseUrl) {
    let url;
    try { url = new URL(supabaseUrl); }
    catch { throw new Error('Configure a valid HTTPS Supabase origin.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Configure an HTTPS Supabase origin without credentials, a path, or a query.');
    }
    connections.push(url.origin);
  }
  // Feature: CAPTCHA loads only from its exact provider origin when a valid public widget key is configured.
  if (turnstileSiteKey && (typeof turnstileSiteKey !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(turnstileSiteKey))) {
    throw new Error('Configure a valid public Turnstile site key.');
  }
  const challengeOrigin = turnstileSiteKey ? ' https://challenges.cloudflare.com' : '';
  // React Native Web requires generated style elements/attributes; executable inline code remains blocked.
  return [
    "default-src 'none'", `script-src 'self'${challengeOrigin}`, "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self' data:", `connect-src ${connections.join(' ')}`,
    `frame-src 'self'${challengeOrigin}`, "media-src 'self' blob:", "object-src 'none'", "base-uri 'none'",
    // Feature: account forms use Auth requests in JavaScript and never send native form submissions.
    "form-action 'none'", "frame-ancestors 'none'", "worker-src 'none'",
  ].join('; ');
}

// Feature: allow only known app documents and build asset types, never arbitrary files from the checkout.
function route(requestTarget) {
  if (typeof requestTarget !== 'string' || requestTarget.length > 2048 || !requestTarget.startsWith('/')) return null;
  let pathname;
  try { pathname = decodeURIComponent(requestTarget.split('?')[0]); } catch { return null; }
  if (/[\\%\u0000-\u001f\u007f]/.test(pathname) || pathname.split('/').some((part) => part.startsWith('.'))) return null;
  // Feature: public legal documents are explicit published routes rather than missing-page fallbacks.
  if (['/', '/index.html', '/app', '/app/', '/terms', '/terms/', '/privacy', '/privacy/'].includes(pathname)) return { file: 'index.html', status: 200, document: true };
  if (pathname === '/404.html') return { file: '404.html', status: 404, document: true };
  // Feature: only the release manifest, checksums and versioned Windows installers are publicly downloadable.
  if (/^\/downloads\/(?:latest\.json|SHA256SUMS\.txt|Little-by-Little-\d+\.\d+\.\d+-x64-Setup\.exe)$/.test(pathname)) return { file: pathname.slice(1), status: 200, document: false, download: true };
  const expo = /^\/_expo\/static\/(?:js\/web\/[a-zA-Z0-9_-]+\.js|css\/[a-zA-Z0-9_-]+\.css)$/.test(pathname);
  const asset = /^\/(?:assets|website)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|css|js)$/.test(pathname);
  if (expo || asset) return { file: pathname.slice(1), status: 200, document: false };
  return { file: '404.html', status: 404, document: true };
}

// Feature: initialize a read-only production server with bounded requests and filesystem containment.
export async function createWebServer({ directory = resolve('dist'), supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL, turnstileSiteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY, requestLimits, trustedProxyIp } = {}) {
  const proxy = trustedProxyIp === undefined ? undefined : canonicalIp(trustedProxyIp);
  if (proxy === null) throw new Error('TRUSTED_PROXY_IP must be one IPv4 or IPv6 address.');
  const root = await realpath(directory);
  // Fail startup when no build exists instead of serving an accidental directory or development fallback.
  await readFile(resolve(root, 'index.html'));
  await readFile(resolve(root, '404.html'));
  const policy = contentSecurityPolicy(supabaseUrl, turnstileSiteKey);
  const requestGate = createRequestGate(requestLimits);
  const server = createServer({ maxHeaderSize: 8192, headersTimeout: 5_000, requestTimeout: 10_000, keepAliveTimeout: 2_000 }, async (request, response) => {
    response.setHeader('Content-Security-Policy', policy);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    response.setHeader('Cache-Control', 'no-store');

    // Feature: isolate proxied clients using one header that only the configured socket peer may supply.
    let client = canonicalIp(request.socket.remoteAddress);
    if (proxy !== undefined) {
      const addresses = request.headersDistinct['x-novel-client-ip'];
      const forwarded = addresses?.length === 1 ? canonicalIp(addresses[0]) : null;
      if (client !== proxy || forwarded === null) {
        const status = client !== proxy ? 403 : 400;
        response.writeHead(status, { Connection: 'close', 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(request.method === 'HEAD' ? undefined : status === 403 ? 'Forbidden.' : 'Invalid proxy client address.');
        return;
      }
      client = forwarded;
    }

    // Feature: reject bursts before filesystem work; each process also has a shared traffic budget.
    const retryAfter = requestGate(client ?? 'unknown');
    if (retryAfter) {
      response.writeHead(429, { 'Retry-After': retryAfter, Connection: 'close', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : 'Too many requests. Please try again shortly.');
      return;
    }

    // Feature: reject request bodies and mutations; this host exposes no upload, proxy, or administrative API.
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD', Connection: 'close', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed.');
      return;
    }
    if (request.headers['transfer-encoding'] || (request.headers['content-length'] && request.headers['content-length'] !== '0')) {
      response.writeHead(400, { Connection: 'close', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : 'Request bodies are not accepted.');
      return;
    }
    const target = route(request.url);
    if (!target) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : 'Invalid request.');
      return;
    }

    try {
      const file = await realpath(resolve(root, target.file));
      const localPath = relative(root, file);
      if (localPath === '..' || localPath.startsWith(`..${sep}`) || isAbsolute(localPath)) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(request.method === 'HEAD' ? undefined : 'Page not found.');
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });
      response.statusCode = target.status;
      response.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
      response.setHeader('Content-Length', info.size);
      // Feature: installers download as attachments; manifests are refreshed so visitors never receive a stale release link.
      if (target.download && extname(file) === '.exe') response.setHeader('Content-Disposition', `attachment; filename="${target.file.split('/').at(-1)}"`);
      if (!target.document) response.setHeader('Cache-Control', target.file.startsWith('_expo/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      if (target.download) response.setHeader('Cache-Control', 'no-store');
      if (target.status === 404) response.setHeader('X-Robots-Tag', 'noindex');
      if (request.method === 'HEAD') response.end();
      else await pipeline(createReadStream(file), response);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      // Missing assets return an error rather than HTML with a misleading JavaScript MIME type.
      response.removeHeader('Content-Length');
      response.statusCode = error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(request.method === 'HEAD' ? undefined : response.statusCode === 404 ? 'Page not found.' : 'The page could not be served.');
    }
  });
  server.maxHeadersCount = 64;
  server.maxConnections = 512;
  server.maxRequestsPerSocket = 100;
  server.setTimeout(15_000, (socket) => socket.destroy());
  // Feature: parser failures never expose stack traces, paths, or reflected request content.
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  return server;
}
