import { useEffect, useState } from 'react';

type Release = { version: string; url: string; bytes: number; sha256: string; signed: boolean };

// Feature: accept only the local release folder or HTTPS downloads, never executable or credential-bearing links.
function validDownload(value: unknown): value is Release {
  if (!value || typeof value !== 'object') return false;
  const release = value as Release;
  if (typeof release.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(release.version)
    || typeof release.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(release.sha256)
    || !Number.isSafeInteger(release.bytes) || release.bytes <= 0 || typeof release.signed !== 'boolean'
    || typeof release.url !== 'string') return false;
  if (/^\/downloads\/Little-by-Little-\d+\.\d+\.\d+-x64-Setup\.exe$/.test(release.url)) return true;
  try { const url = new URL(release.url); return url.protocol === 'https:' && !url.username && !url.password && url.pathname.endsWith('.exe'); }
  catch { return false; }
}

// Feature: the download becomes available only after a real release manifest is published; unavailable releases retain browser access.
export default function DesktopDownload() {
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    fetch('/downloads/latest.json', { signal: controller.signal, cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new Error('Unavailable'); return response.json(); })
      .then((value: unknown) => { if (validDownload(value)) setRelease(value); })
      .catch(() => {})
      .finally(() => { clearTimeout(timer); setLoading(false); });
    return () => { clearTimeout(timer); controller.abort(); };
  }, []);
  return <section className="site-download" id="download" aria-labelledby="download-title">
    <div><img src="/website/app-logo.svg" width="80" height="80" alt="" /><h2 id="download-title">A home on your desktop</h2><p>Keep your writing desk close. Write offline, save on this computer, and keep automatic backups in a folder you choose.</p><p>The Windows app includes everything it needs to run. No separate Node.js or browser installation required.</p></div>
    <div className="download-details">
      <h3>Little by Little for Windows</h3><p>Windows 10 or later · 64-bit Intel / AMD</p>
      {release ? <><p>Version {release.version} · {(release.bytes / 1024 / 1024).toFixed(1)} MB</p><a className="site-action" href={release.url} download>Download for Windows</a><p className="download-status">{release.signed ? 'Digitally signed installer.' : 'Unsigned preview: Windows may show an unknown-publisher warning.'}</p><details><summary>Verify your download</summary><p>Compare the SHA-256 below with the file’s hash before opening it. A matching hash checks file integrity; it does not verify the publisher.</p><code className="download-hash">{release.sha256}</code><p>In PowerShell, run:</p><code className="download-hash">Get-FileHash .\Little-by-Little-{release.version}-x64-Setup.exe -Algorithm SHA256</code></details></> : <p role="status">{loading ? 'Checking the desktop download…' : 'The desktop download is not available yet. You can start writing in your browser.'}</p>}
      <a className="site-text-link" href="/app">Prefer your browser? Open the writing desk</a><p>Already writing in the browser? Export a workspace backup and import it in the desktop app, or use optional cloud sync.</p>
    </div>
  </section>;
}
