import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { publicWebRoute, securityHeaders } from '../server/web.mjs';

// Feature: emit Vercel's native routing configuration with the application's exact provider allowlist.
export function vercelConfiguration(supabaseUrl, turnstileSiteKey = '') {
  return {
    version: 3,
    routes: [
      { src: '/(.*)', headers: securityHeaders(supabaseUrl, turnstileSiteKey), continue: true },
      { src: '/(.*)', methods: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE'], status: 405, headers: { Allow: 'GET, HEAD' } },
      { src: '^/(?:|index\\.html|(?:app|terms|privacy)/?)$', dest: '/index.html' },
      { src: '^/404\\.html$', dest: '/404.html', status: 404, headers: { 'X-Robots-Tag': 'noindex' } },
      { src: '^/downloads/(Little-by-Little-\\d+\\.\\d+\\.\\d+-x64-Setup\\.exe)$', headers: { 'Content-Disposition': 'attachment; filename="$1"' }, continue: true },
      { src: '^/_expo/static/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/404.html', status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    ],
  };
}

// Feature: publish only allowlisted regular files; do not follow symlinks or ship source maps and export metadata.
async function publishedFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Vercel packaging refuses linked files and folders.');
    if (entry.isDirectory()) files.push(...await publishedFiles(join(directory, entry.name), `${name}/`));
    else if (entry.isFile()) {
      const target = publicWebRoute(`/${name}`);
      if ((target?.status === 200 && target.file === name) || name === '404.html') files.push(name);
    }
  }
  return files;
}

// Feature: validate generated paths before replacing only this project's disposable Vercel output.
async function outputDirectory(root) {
  const vercel = join(root, '.vercel');
  await mkdir(vercel, { recursive: true });
  if ((await lstat(vercel)).isSymbolicLink() || await realpath(vercel) !== vercel) throw new Error('Vercel output must stay inside the project.');
  const output = resolve(vercel, 'output');
  const local = relative(root, output);
  if (local !== `.vercel${sep}output`) throw new Error('Unexpected Vercel output directory.');
  try {
    if ((await lstat(output)).isSymbolicLink() || await realpath(output) !== output) throw new Error('Vercel output must not be a linked directory.');
    await rm(output, { recursive: true, force: true });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(join(output, 'static'), { recursive: true });
  return output;
}

// Feature: package the completed web export separately so desktop builds never alter the deployed website bundle.
export async function prepareVercelOutput(projectRoot, supabaseUrl, turnstileSiteKey = '') {
  const config = vercelConfiguration(supabaseUrl, turnstileSiteKey);
  const root = await realpath(projectRoot);
  const source = join(root, 'dist');
  if ((await lstat(source)).isSymbolicLink()) throw new Error('Vercel packaging requires a local web export.');
  for (const required of ['index.html', '404.html']) await readFile(join(source, required), 'utf8');
  const files = await publishedFiles(source);
  const output = await outputDirectory(root);
  for (const name of files) {
    const destination = join(output, 'static', name);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(source, name), destination);
  }
  await writeFile(join(output, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  return { output, count: files.length };
}
