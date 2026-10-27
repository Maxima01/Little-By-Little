import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Feature: a short isolated UI check covers section switching, responsive navigation, and reachable form actions.
// Serve the web build at localhost:8093 before running; this never opens the writer's browser profile.
const output = '.local-checks/navigation';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:8093');
  const button = (name) => page.getByRole('button', { name, exact: true });
  await button('Start my story').click();
  await page.getByRole('textbox', { name: 'New story title', exact: true }).fill('Navigation check');
  await button('Create').click();
  await expect(page.getByRole('textbox', { name: 'Chapter title', exact: true })).toHaveValue('Chapter 1');
  await expect(button('1. Chapter 1')).toHaveAttribute('aria-pressed', 'true');
  for (const section of ['Characters', 'World Building', 'Art', 'Notes', 'Research', 'Chapters']) {
    await button(section).click();
    await expect(button(section)).toHaveAttribute('aria-pressed', 'true');
    await expect(button('1. Chapter 1')).toHaveAttribute('aria-pressed', 'false');
  }
  await page.screenshot({ path: `${output}/desktop.png` });
  await button('My stories').click();
  await expect(button('Navigation check')).toHaveAttribute('aria-pressed', 'false');
  await button('Navigation check').click();
  await button('Hide navigation').click();
  await expect(button('Show navigation')).toBeVisible();
  await button('Show navigation').click();
  await button('1. Chapter 1').click();

  await page.setViewportSize({ width: 900, height: 800 });
  await button('Navigation check').click();
  await page.getByRole('textbox', { name: 'Story title', exact: true }).fill('A long story title to check the compact desktop workspace layout');
  await page.screenshot({ path: `${output}/compact-desktop.png` });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No overflow at the desktop breakpoint');
  await button('1. Chapter 1').click();

  for (const width of [899, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await button('Show navigation').click();
    await expect(button('Close navigation')).toBeVisible();
    if (width === 390) await page.screenshot({ path: `${output}/navigation-drawer.png` });
    await button('Research').click();
    await expect(button('Close navigation')).toHaveCount(0);
    await button('Continue writing').click();
    await expect(page.getByRole('textbox', { name: 'Chapter title', exact: true })).toHaveValue('Chapter 1');
    await expect(button('Continue writing')).toHaveAttribute('aria-pressed', 'true');
    await button('Show navigation').click();
    await button('World Building').click();
    await expect(button('Close navigation')).toHaveCount(0);
    await page.screenshot({ path: `${output}/compact-${width}.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow at ${width}px`);
    await button('Show navigation').click();
    await expect(page.getByRole('dialog', { name: 'Story navigation', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(button('Close navigation')).toHaveCount(0);
    await button('Continue writing').click();
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 520 });
  await button('Show navigation').click();
  await button('World Building').click();
  await button('＋ New worldbuilding entry').click();
  await expect(page.getByRole('dialog', { name: 'New worldbuilding entry', exact: true })).toBeVisible();
  await expect(button('Create')).toBeInViewport();
  await expect(button('Cancel')).toBeInViewport();
  await page.getByRole('textbox', { name: 'New entry title', exact: true }).fill('   ');
  await button('Create').click();
  await expect(page.getByRole('alert')).toContainText('Enter a title');
  await page.screenshot({ path: `${output}/short-dark-dialog.png` });
  await button('Cancel').click();
  assert.deepEqual(errors, []);
  console.log('PASS: desktop sections, selected states, sidebar toggle, 899/390/320px navigation, Escape, resume, short dark dialog, validation, and no runtime errors.');
} finally {
  await browser.close();
}
