import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Feature: make Expo's generated bundle links relative so the production Electron file:// page loads offline.
// Web exports retain their normal root-relative URLs; only the explicit desktop build applies this conversion.
const file = fileURLToPath(new URL('../dist/index.html', import.meta.url));
const html = await readFile(file, 'utf8');
const desktopHtml = html.replace(/\b(src|href)=(['"])\/(_expo\/[^'"]+)\2/g, '$1=$2./$3$2');
await writeFile(file, desktopHtml);

// Feature: stage only runtime files for Electron Builder so the standalone app excludes source and development dependencies.
const root = fileURLToPath(new URL('../', import.meta.url));
const staging = fileURLToPath(new URL('../.desktop-package/', import.meta.url));
const sourcePackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(new URL('../dist/', import.meta.url), new URL('../.desktop-package/dist/', import.meta.url), { recursive: true });
for (const runtimeFile of ['electron-main.cjs', 'electron-preload.cjs', 'electron-pdf.cjs', 'electron-backup.cjs']) {
  await copyFile(`${root}${runtimeFile}`, `${staging}${runtimeFile}`);
}
const stagedPackage = {
  name: sourcePackage.name,
  version: sourcePackage.version,
  description: sourcePackage.description,
  private: true,
  main: 'electron-main.cjs',
  // Build-only marker prevents the packager from walking the parent project's bundled renderer dependencies.
  dependencies: { 'little-by-little-runtime': '1.0.0' },
};
await mkdir(`${staging}node_modules/little-by-little-runtime`, { recursive: true });
await writeFile(`${staging}node_modules/little-by-little-runtime/package.json`, JSON.stringify({ name: 'little-by-little-runtime', version: '1.0.0' }));
await writeFile(`${staging}node_modules/.package-lock.json`, JSON.stringify({
  name: stagedPackage.name,
  version: stagedPackage.version,
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: stagedPackage.name, version: stagedPackage.version, dependencies: stagedPackage.dependencies },
    'node_modules/little-by-little-runtime': { version: '1.0.0' },
  },
}, null, 2));
await writeFile(`${staging}package.json`, JSON.stringify(stagedPackage, null, 2));
console.log('Desktop build prepared: bundle links are relative and runtime files are staged for packaging.');
