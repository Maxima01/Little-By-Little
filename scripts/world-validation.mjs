import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, _electron as electron, expect as baseExpect } from '@playwright/test';
import { WORLD_FIELDS } from '../src/features/world/lib/worldProfile.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = path.join(root, '.local-checks/desktop', `worldbuilding-${Date.now()}`);
const output = path.join(root, 'audits/worldbuilding-2026-10-12');
const storyTitle = 'World profiles QA';
const failures = [], checks = [];
const expect = baseExpect.configure({ timeout: 15000 });
let desktop, browser, page;
const entries = [
  { category: 'Setting', title: 'Coastal port' }, { category: 'History', title: 'The long winter' },
  { category: 'Faction', title: 'Tidewatch' }, { category: 'Family', title: 'Ashford' },
  { category: 'Organization', title: 'Harbour guild' },
];
// Feature: named controls drive real UI interactions; validation never writes fixtures into the app database.
const button = (name) => page.getByRole('button', { name, exact: typeof name === 'string' });
const field = (name) => page.getByRole('textbox', { name, exact: true });
// Feature: read the actual committed workspace and recovery versions to verify autosave without state injection.
async function record() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('little-by-little', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { const raw = await new Promise((resolve, reject) => { const request = db.transaction('workspace', 'readonly').objectStore('workspace').get('little-by-little.workspace.v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); return JSON.parse(raw); }
    finally { db.close(); }
  });
}
// Feature: inspect only the isolated QA story, leaving starter and real writer data untouched.
const storyOf = (saved) => saved.workspace.stories.find((story) => story.title === storyTitle);
// Feature: every step explicitly commits pending changes before inspecting persistence or navigating away.
async function save() { await button('Save now').click(); await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible(); }
// Feature: section navigation follows the same story menu used by writers.
async function section(name) { await button(storyTitle).click(); await button(new RegExp(`\\b${name}\\b`)).click(); }
// Feature: validate horizontal layout at phone width without excluding scrollable profile fields.
async function noOverflow() {
  const overflow = await page.evaluate(() => [...document.querySelectorAll('input,textarea,[role="button"],[role="tab"],[role="checkbox"]')].filter((node) => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return rect.width > 0 && style.visibility !== 'hidden' && (rect.left < -1 || rect.right > innerWidth + 1);
  }).map((node) => node.getAttribute('aria-label') || node.textContent));
  assert.deepEqual(overflow, []);
}
// Feature: run the built production desktop entry point with a fresh, retained test profile and hidden QA window.
async function launch() {
  // Feature: reapply file-compatible bundle links when another web export has refreshed the shared dist directory.
  await import(new URL(`./prepare-desktop-build.mjs?validation=${Date.now()}`, import.meta.url).href);
  const env = { ...process.env, NOVEL_DESKTOP_TEST_PROFILE: path.join(run, 'profile') }; delete env.ELECTRON_RUN_AS_NODE;
  desktop = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [path.join(root, 'scripts/desktop-validation-main.cjs')], cwd: root, env, timeout: 45000 });
  page = await desktop.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error('Renderer:', message.text()); });
  await page.setViewportSize({ width: 1640, height: 960 });
  await expect(button('Go to My stories')).toBeVisible();
  // Feature: keep animations and input updates running while the isolated QA window stays hidden.
  await desktop.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) { window.webContents.setBackgroundThrottling(false); window.hide(); } });
}
// Feature: the built renderer runs in isolated headless Chrome for reliable phone-sized screenshots below Electron's minimum window width.
async function launchWeb() {
  await import(new URL(`./prepare-desktop-build.mjs?validation=${Date.now()}`, import.meta.url).href);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1640, height: 960 }, colorScheme: 'light' });
  page.setDefaultTimeout(15000); page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(pathToFileURL(path.join(root, 'dist/index.html')).href);
  await expect(button('Start my story')).toBeVisible();
}
// Feature: close isolated test windows even if a failed UI step left an unsaved draft.
async function close() {
  if (!desktop) return;
  await desktop.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.once('will-prevent-unload', (event) => event.preventDefault()); });
  await desktop.close(); desktop = undefined;
}

try {
  await mkdir(output, { recursive: true }); await launchWeb();
  await button('Start my story').click(); await field('New story title').fill(storyTitle); await button('Create').click();
  await expect(field('Chapter title')).toHaveValue('Chapter 1');
  for (const entry of entries) {
    await section('World Building'); await button('＋ New worldbuilding entry').click();
    await field('New entry title').fill(entry.title); await button(entry.category).click(); await field('New entry notes').fill(`Original notes: ${entry.title}`); await button('Create').click();
    await expect(field('World entry name')).toHaveValue(entry.title);
    for (const group of WORLD_FIELDS[entry.category]) for (const item of group.fields) await field(item.label).fill(`QA ${item.label}`);
    await field('Plans & key notes').fill(`Plans for ${entry.title}`);
    await page.getByRole('tab', { name: 'Detailed description', exact: true }).click(); await expect(field('Detailed description')).toHaveValue(`Original notes: ${entry.title}`);
    await field('Detailed description').fill(`Detailed notes: ${entry.title}`); await save();
    const saved = storyOf(await record()).worldbuilding.find((item) => item.title === entry.title);
    assert.equal(saved.category, entry.category); assert.equal(saved.content, `Detailed notes: ${entry.title}`);
    for (const group of WORLD_FIELDS[entry.category]) for (const item of group.fields) assert.equal(saved.worldProfile[item.key], `QA ${item.label}`);
    checks.push(`${entry.category}: every structured field, existing description, author notes and autosave`); console.log(`PASS ${entry.category} dossier`);
  }
  await section('Characters'); await button('＋ New character').click(); await field('New entry title').fill('Mara'); await button('Create').click();
  await field('Affiliations').fill('Written loyalties remain separate'); await button('Choose memberships').click();
  await page.getByRole('checkbox', { name: 'Membership: Family Ashford', exact: true }).click(); await page.getByRole('checkbox', { name: 'Membership: Faction Tidewatch', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Membership: Family Ashford', exact: true })).toBeChecked();
  await save(); await button('Open membership Ashford').click(); await expect(page.getByText('Linked members (1)', { exact: true })).toBeVisible();
  await field('World entry name').fill('House Ashford'); await save(); await button('Open member Mara').click();
  await expect(button('Open membership House Ashford')).toBeVisible(); await expect(field('Affiliations')).toHaveText('Written loyalties remain separate');
  checks.push('Explicit memberships, reciprocal navigation, current renamed titles and preserved affiliation notes'); console.log('PASS memberships and rename');
  await button('Open membership House Ashford').click(); await button('View world key events for House Ashford').click(); await button('＋ Add key event').click(); await button('Save event').click();
  await expect(page.getByRole('alert')).toHaveText('Give this event a title.');
  await field('Event title').fill('The founding'); await field('Time in the story (optional)').fill('Year 12'); await field('Event details').fill('The family settles at the port.');
  await button('Choose event chapter').click(); await button('Link event to chapter 1: Chapter 1').click(); await button('Save event').click();
  await expect(page.getByText('The family settles at the port.', { exact: true })).toBeVisible(); await button('Expand world event The founding').click(); await expect(page.getByText('The family settles at the port.', { exact: true })).toHaveCount(0);
  await button('Expand world event The founding').click(); await button('Edit world event The founding').click(); await field('Event details').fill('The family settles and builds a harbour.'); await button('Save event').click();
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'family-events-desktop.png') }); await button('Open chapter: Chapter 1').click(); await expect(field('Chapter title')).toHaveValue('Chapter 1');
  await section('World Building'); await page.getByText('House Ashford', { exact: true }).click(); await button('View world key events for House Ashford').click(); await button('Expand world event The founding').click(); await button('Remove world event The founding').click(); await button('Close world event dialog').click(); await save();
  const removed = await record(), checkpoint = removed.versions.find((version) => version.label === 'Before removing world event');
  assert.ok(checkpoint.workspace.stories.find((story) => story.title === storyTitle).worldbuilding.find((item) => item.title === 'House Ashford').worldProfile.events.some((event) => event.title === 'The founding'));
  checks.push('World events: title validation, chapter/time links, expand/collapse, edit, chapter navigation and removal checkpoint'); console.log('PASS world events and recovery checkpoint');
  await button('View world key events for House Ashford').click(); await button('＋ Add key event').click(); await field('Event title').fill('A lasting promise'); await field('Event details').fill('The vow is passed down through the family.'); await button('Save event').click(); await button('Close world event dialog').click(); await save();
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'family-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 }); await field('World entry name').scrollIntoViewIfNeeded(); await noOverflow(); await page.screenshot({ animations: 'disabled', path: path.join(output, 'family-mobile.png') });
  await button('View world key events for House Ashford').click(); await button('Expand world event A lasting promise').click(); await noOverflow(); await page.screenshot({ animations: 'disabled', path: path.join(output, 'family-events-mobile.png') }); await button('Close world event dialog').click();
  await page.emulateMedia({ colorScheme: 'dark' }); await field('World entry name').scrollIntoViewIfNeeded(); await noOverflow(); await page.screenshot({ animations: 'disabled', path: path.join(output, 'family-dark-mobile.png') }); await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1640, height: 960 });
  await button(storyTitle).click(); await button('1. Chapter 1').click(); await button('Choose scene setting').click(); await button('Coastal port').click();
  await button(/Setting continuity/).click(); await expect(page.getByText(/Geography & landscape: QA Geography & landscape/)).toBeVisible();
  await save(); await section('World Building'); await page.getByText('Coastal port', { exact: true }).click(); await expect(button('Open setting chapter Chapter 1')).toBeVisible(); await field('World entry name').scrollIntoViewIfNeeded(); await page.screenshot({ animations: 'disabled', path: path.join(output, 'setting-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 }); await field('World entry name').scrollIntoViewIfNeeded(); await noOverflow(); await page.screenshot({ animations: 'disabled', path: path.join(output, 'setting-mobile.png') }); await page.setViewportSize({ width: 1640, height: 960 });
  checks.push('Scene assignments, structured setting context, desktop/mobile layouts, mobile events and dark theme'); console.log('PASS setting context and responsive layouts');
  await section('World Building'); await button('Delete Tidewatch').click(); await button('Delete').click(); await save();
  await section('Characters'); await page.getByText('Mara', { exact: true }).click(); await expect(page.getByText('Deleted group', { exact: true })).toBeVisible();
  await button('Remove membership deleted group').click(); await save(); assert.equal(storyOf(await record()).characters[0].characterProfile.membershipIds.length, 1);
  checks.push('Deleted group membership feedback and explicit removal'); console.log('PASS deleted membership handling');
  await section('World Building'); await page.getByText('House Ashford', { exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), button('Download backup').click()]); const backupPath = path.join(run, 'workspace-backup.json'); await download.saveAs(backupPath);
  const before = (await record()).workspace; assert.deepEqual(JSON.parse(await readFile(backupPath, 'utf8')), before);
  await browser.close(); browser = undefined; await launch();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button('Import backup').click()]); await chooser.setFiles(backupPath);
  await button('Restore workspace').click(); await expect(button('Close version history')).toHaveCount(0); await save();
  assert.deepEqual(storyOf(await record()).worldbuilding, before.stories.find((story) => story.title === storyTitle).worldbuilding);
  assert.deepEqual(storyOf(await record()).characters, before.stories.find((story) => story.title === storyTitle).characters);
  const desktopBefore = (await record()).workspace; await close(); await launch(); assert.deepEqual((await record()).workspace, desktopBefore);
  await section('World Building'); await page.getByText('House Ashford', { exact: true }).click(); await expect(field('Family origins')).toHaveValue('QA Family origins'); await expect(page.getByText('Linked members (1)', { exact: true })).toBeVisible();
  await button('View world key events for House Ashford').click(); await button('Expand world event A lasting promise').click(); await expect(page.getByText('The vow is passed down through the family.', { exact: true })).toBeVisible();
  assert.deepEqual(failures, []); checks.push('Downloaded workspace backup and full persistence in a separate Electron process; no renderer errors'); console.log('PASS backup and process restart');
} catch (error) { failures.push(error.stack || String(error)); console.error(error); if (page) await page.screenshot({ animations: 'disabled', path: path.join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1; }
finally { await writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, failures, profile: run }, null, 2)); await close(); await browser?.close(); }

