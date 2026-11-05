import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Feature: rasterize the existing vector mark into a multi-resolution Windows icon without external artwork or services.
const svg = await readFile(new URL('../public/website/app-logo.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const images = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>body{margin:0}svg{width:100vw;height:100vh}</style>${svg}`);
    images.push({ size, data: await page.screenshot({ omitBackground: true }) });
  }
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  await mkdir(new URL('../build/', import.meta.url), { recursive: true });
  await writeFile(new URL('../build/icon.ico', import.meta.url), Buffer.concat([header, ...images.map(({ data }) => data)]));
  await writeFile(new URL('../public/website/app-icon.png', import.meta.url), images.at(-1).data);
} finally { await browser.close(); }
