import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Feature: publish a versioned installer and integrity manifest only after checking the actual Windows signature and bytes.
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a stable numeric package version for the Windows download.');
const name = `Little-by-Little-${version}-x64-Setup.exe`;
const source = new URL(`../release/${name}`, import.meta.url);
const directory = new URL('../public/downloads/', import.meta.url);
// Feature: Windows PowerShell resolves its own security modules even when the build starts in PowerShell 7.
const signatureEnvironment = { ...process.env, NOVEL_INSTALLER_PATH: fileURLToPath(source) };
for (const key of Object.keys(signatureEnvironment)) if (key.toLowerCase() === 'psmodulepath') delete signatureEnvironment[key];
const signature = JSON.parse(execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command',
  '$ErrorActionPreference = "Stop"; $s = Get-AuthenticodeSignature -LiteralPath $env:NOVEL_INSTALLER_PATH; @{status=$s.Status.ToString(); timestamp=($null -ne $s.TimeStamperCertificate)} | ConvertTo-Json -Compress'],
  { encoding: 'utf8', env: signatureEnvironment }));
if (!['Valid', 'NotSigned'].includes(signature.status)) throw new Error(`Installer signature failed verification: ${signature.status}`);
const signed = signature.status === 'Valid' && signature.timestamp;
if (process.argv.includes('--require-signed') && !signed) throw new Error('A valid timestamped signature is required to publish this release.');
const hash = createHash('sha256');
for await (const chunk of createReadStream(source)) hash.update(chunk);
const sha256 = hash.digest('hex');
let url = `/downloads/${name}`;
// Feature: an optional HTTPS asset location lets the same website use GitHub Releases or object storage on any host.
if (process.env.DESKTOP_DOWNLOAD_BASE_URL) {
  const base = new URL(process.env.DESKTOP_DOWNLOAD_BASE_URL.replace(/\/$/, '') + '/');
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Download base must be an HTTPS URL without credentials, query or fragment.');
  url = new URL(name, base).href;
}
await mkdir(directory, { recursive: true });
if (!process.env.DESKTOP_DOWNLOAD_BASE_URL) await copyFile(source, new URL(name, directory));
const manifest = { version, url, bytes: (await stat(source)).size, sha256, signed };
await writeFile(new URL('SHA256SUMS.txt', directory), `${sha256}  ${name}\n`);
await writeFile(new URL('latest.json.tmp', directory), JSON.stringify(manifest, null, 2) + '\n');
await rename(new URL('latest.json.tmp', directory), new URL('latest.json', directory));
await writeFile(new URL(`../release/${name}.sha256`, import.meta.url), `${sha256}  ${name}\n`);
console.log(`Download prepared: ${name} (${signed ? 'signed and timestamped' : 'unsigned preview'}).`);
if (process.env.DESKTOP_DOWNLOAD_BASE_URL) console.log('Upload the installer to the configured HTTPS location before deploying the website manifest.');
