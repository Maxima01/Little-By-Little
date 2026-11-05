import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Feature: capture website artwork from a disposable browser profile containing only the built-in example story.
// Start the production preview at localhost:8093 first; no writer profile, account or manuscript is loaded.
const baseUrl = process.env.NOVEL_CAPTURE_URL ?? 'http://127.0.0.1:8093/app';
const output = new URL('../public/website/', import.meta.url);
// Feature: retain correct local paths when the project folder contains spaces or non-ASCII characters.
const imagePath = (name) => fileURLToPath(new URL(name, output));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'Asia/Shanghai',
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  console.log('Loaded screenshot source:', page.url());
  const button = (name) => page.getByRole('button', { name, exact: true });
  await button('The House by the Sea').click();
  await page.getByRole('textbox', { name: 'Story title', exact: true }).waitFor();
  await page.setViewportSize({ width: 1240, height: 900 });
  await page.screenshot({ path: imagePath('story-library.png'), clip: { x: 278, y: 130, width: 960, height: 650 }, animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await button('1. Chapter One').click();
  await page.getByRole('textbox', { name: 'Chapter text editor', exact: true }).waitFor();
  // Feature: demonstrate real scene setting and cast controls using the example's existing Mara and seaside house.
  await page.getByRole('textbox', { name: 'Scene name', exact: true }).fill('Arrival at the house');
  await button('Choose scene setting').click();
  await button('The house by the sea').click();
  await page.getByRole('checkbox', { name: /Mara/ }).click();
  await page.getByText('Saved on this device', { exact: true }).first().waitFor();
  await page.screenshot({ path: imagePath('writing-desk.png'), animations: 'disabled' });
  // Feature: a close crop keeps scene controls readable instead of shrinking a full application window.
  // Feature: capture only the real context panel, keeping its fields readable in the public-page close-up.
  const contextBounds = await page.getByText('Chapter context', { exact: true }).locator('xpath=../../..').boundingBox();
  if (!contextBounds) throw new Error('Chapter context is not visible for the product capture.');
  await page.screenshot({ path: imagePath('chapter-context.png'), clip: { x: contextBounds.x, y: contextBounds.y, width: contextBounds.width, height: Math.min(contextBounds.height, 848 - contextBounds.y) }, animations: 'disabled' });

  await button('Save now').click();
  await button('Workspace backups and history').click();
  await button('Version history').click();
  await page.getByRole('dialog', { name: 'Workspace version history and recovery', exact: true }).waitFor();
  await page.getByText('Manual checkpoint', { exact: true }).first().waitFor();
  // Feature: the history close-up shows the recovery dialog itself without unrelated account fields behind it.
  await page.getByRole('dialog', { name: 'Workspace version history and recovery', exact: true }).getByText('Version history', { exact: true }).locator('xpath=../..').screenshot({ path: imagePath('save-history.png'), animations: 'disabled' });
  console.log('Captured four marketing images from The House by the Sea in an isolated local workspace.');
  await context.close();
} finally {
  await browser.close();
}
