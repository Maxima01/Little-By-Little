import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Feature: static hosts receive real app and 404 documents while sharing Expo's hashed renderer bundle.
const directory = new URL('../dist/', import.meta.url);
const index = new URL('index.html', directory);
let html = await readFile(index, 'utf8');
html = html.replace(/<title>[^<]*<\/title>/, '<title>Little by Little — A home for your novel</title>');
html = html.replace('</head>', '<meta name="description" content="Write your novel, connect your characters and build your world in Little by Little, an offline-first writing workspace."></head>');
await writeFile(index, html);
// Feature: static hosts can serve the workspace and public legal URLs without rewrite configuration.
for (const route of ['app', 'terms', 'privacy']) {
  await mkdir(new URL(`${route}/`, directory), { recursive: true });
  await copyFile(index, new URL(`${route}/index.html`, directory));
}
await writeFile(new URL('404.html', directory), html.replace(/<title>[^<]*<\/title>/, '<title>Page not found — Little by Little</title>'));
console.log(`Website documents prepared in ${fileURLToPath(directory)}`);
