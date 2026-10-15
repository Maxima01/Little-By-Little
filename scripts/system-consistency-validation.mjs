import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, expect as baseExpect } from '@playwright/test';
import { createStarterWorkspace, createEntry, createScene, countWords } from '../src/domain/model.ts';
import { anchorText } from '../src/features/editor/lib/manuscriptOperations.ts';
import { manuscriptText } from '../src/features/editor/lib/writingAnalysis.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'audits/system-2026-10-13');
const expect = baseExpect.configure({ timeout: 15000 });
const checks = [], errors = [];
const workspace = createStarterWorkspace(), story = workspace.stories[0], chapter = story.chapters[0], character = story.characters[0], coast = story.worldbuilding[0];
story.title = 'System consistency audit'; story.isExample = false; chapter.title = 'First chapter'; coast.title = 'Coast';
coast.worldProfile = { geography: 'Rocky shore', authorNotes: 'Preserved plan' };
const family = createEntry('House Grey', 'Family'), history = createEntry('The Flood', 'History'), town = createEntry('Town', 'Setting');
history.content = 'The original written history.'; history.worldProfile = { participants: 'Unnamed relatives' };
story.worldbuilding.push(family, history, town);
character.characterProfile = { aliases: 'Keeper', membershipIds: [family.id], affiliations: '@/House Grey', affiliationLinks: [{ targetId: family.id, start: 0, end: 12 }] };
chapter.html = '<p>Ma<strong>ra</strong> said don&#39;t.</p><p>Keeper entered town.</p>';
const text = manuscriptText(chapter.html), shoreScene = createScene('Shore scene'), townScene = createScene('Town scene'), unplaced = createScene('Unplaced scene');
shoreScene.settingId = coast.id; shoreScene.characterIds = [character.id, 'deleted-cast']; shoreScene.anchor = anchorText(text, 0, 4);
townScene.settingId = town.id; townScene.anchor = anchorText(text, text.indexOf('Keeper'), text.indexOf('Keeper') + 6);
chapter.scenes = [townScene, unplaced, shoreScene]; chapter.activeSceneId = shoreScene.id;
let browser, page;
const button = (name) => page.getByRole('button', { name, exact: typeof name === 'string' });
const field = (name) => page.getByRole('textbox', { name, exact: true });

// Feature: regression fixtures enter only a fresh browser context through the real backup import workflow.
async function importFixture() {
  await button('Import backup').click();
}
// Feature: read committed storage without injecting state or trusting save labels alone.
async function record() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('little-by-little', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return JSON.parse(await new Promise((resolve, reject) => { const request = db.transaction('workspace', 'readonly').objectStore('workspace').get('little-by-little.workspace.v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); })); }
    finally { db.close(); }
  });
}
// Feature: every assertion inspects the same isolated story after explicit durable save.
async function save() { await button('Save now').click(); await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible(); return record(); }
// Feature: navigate with actual story controls to catch broken direct-reference routes.
async function section(label) { await button(story.title).click(); await button(new RegExp(`\\b${label}\\b`)).click(); }
// Feature: report independent audit checks and retain screenshots even if a regression fails.
async function check(name, action) {
  try { await action(); checks.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, status: 'FAIL', error: error.stack ?? String(error) }); console.error(`FAIL ${name}: ${error.message}`); throw error; }
}
// Feature: visible form controls must remain inside both desktop and phone viewports.
async function noOverflow() {
  const overflow = await page.evaluate(() => [...document.querySelectorAll('input,textarea,[role="button"],[role="radio"],[role="checkbox"]')].filter((node) => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return rect.width > 0 && style.visibility !== 'hidden' && (rect.left < -1 || rect.right > innerWidth + 1);
  }).map((node) => node.getAttribute('aria-label') || node.textContent));
  assert.deepEqual(overflow, []);
}

try {
  await mkdir(output, { recursive: true });
  const fixturePath = path.join(output, 'isolated-fixture.json'); await writeFile(fixturePath, JSON.stringify(workspace));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1640, height: 960 }, acceptDownloads: true });
  page.setDefaultTimeout(15000); page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.goto(pathToFileURL(path.join(root, 'dist/index.html')).href);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), importFixture()]); await chooser.setFiles(fixturePath);
  await expect(page.getByText('Imported backup', { exact: true })).toBeVisible(); await button('Restore workspace').click();
  await check('Type changes require confirmation, show affected records and preserve cancelled drafts', async () => {
    await section('World Building'); await page.getByText('Coast', { exact: true }).click();
    await button('Change world entry type').click(); await page.getByRole('radio', { name: 'New world type: History', exact: true }).click();
    await expect(page.getByText(/Facts hidden by the new profile.*Geography/)).toBeVisible();
    await expect(page.getByText(/Scenes that will need a Setting.*Shore scene/)).toBeVisible();
    assert.equal((await record()).workspace.stories[0].worldbuilding[0].category, 'Setting');
    await button('Cancel').click(); await expect(field('Geography & landscape')).toHaveValue('Rocky shore');
  });
  await check('History links save by ID and open both directions without changing the account', async () => {
    await section('World Building'); await page.getByText('The Flood', { exact: true }).click();
    for (const [label, title] of [['Places', 'Coast'], ['Characters involved', 'Mara'], ['Groups involved', 'House Grey']]) {
      await button(`Choose history ${label}`).click(); await page.getByRole('checkbox', { name: `History ${label}: ${title}`, exact: true }).click();
      await button(`Choose history ${label}`).click();
    }
    const saved = await save(), profile = saved.workspace.stories[0].worldbuilding.find((item) => item.id === history.id).worldProfile;
    assert.deepEqual(profile.settingIds, [coast.id]); assert.deepEqual(profile.participantCharacterIds, [character.id]); assert.deepEqual(profile.participantGroupIds, [family.id]);
    assert.equal(profile.participants, 'Unnamed relatives');
    await button('Open history Characters involved: Mara').click(); await expect(field('Character name')).toHaveValue('Mara');
    await button('Open related history The Flood').click(); await expect(field('World entry name')).toHaveValue('The Flood');
    await button('Open history Groups involved: House Grey').click(); await field('World entry name').fill('House Silver'); await save();
    await button('Open related history The Flood').click(); await expect(button('Open history Groups involved: House Silver')).toBeVisible();
    await page.getByRole('tab', { name: 'Detailed description', exact: true }).click(); await expect(field('Detailed description')).toHaveValue(history.content);
    await page.getByRole('tab', { name: 'Profile', exact: true }).click(); await noOverflow(); await page.screenshot({ path: path.join(output, 'history-desktop.png'), animations: 'disabled' });
    await button('Choose history Places').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, 'history-links-desktop.png'), animations: 'disabled' });
  });
  await check('Group conversion previews memberships/history, retains links and creates a recovery checkpoint', async () => {
    await button('Open history Groups involved: House Silver').click(); await button('Change world entry type').click();
    await page.getByRole('radio', { name: 'New world type: Setting', exact: true }).click();
    await expect(page.getByText(/Character memberships.*Mara/)).toBeVisible(); await expect(page.getByText(/History references.*The Flood/)).toBeVisible();
    await button('Confirm world type change').click(); const saved = await save();
    assert.equal(saved.workspace.stories[0].worldbuilding.find((item) => item.id === family.id).category, 'Setting');
    assert.deepEqual(saved.workspace.stories[0].characters[0].characterProfile.membershipIds, [family.id]);
    const checkpoint = saved.versions.find((item) => item.label === 'Before changing world entry type');
    assert.equal(checkpoint.workspace.stories[0].worldbuilding.find((item) => item.id === family.id).category, 'Family');
    await button('Open related history The Flood').click(); await expect(page.getByText('Now Setting — review this link', { exact: true })).toBeVisible();
    await button('Open history Groups involved: House Silver').click(); await button('Change world entry type').click(); await page.getByRole('radio', { name: 'New world type: Family', exact: true }).click(); await button('Confirm world type change').click(); await save();
    await button('Open related history The Flood').click(); await expect(page.getByText('Family', { exact: true })).toBeVisible();
  });
  await check('History connections and type confirmation stay usable at 390px and in dark mode', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await field('World entry name').scrollIntoViewIfNeeded(); await noOverflow();
    await page.screenshot({ path: path.join(output, 'history-mobile.png'), animations: 'disabled' });
    await button('Choose history Places').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, 'history-links-mobile.png'), animations: 'disabled' });
    await field('World entry name').scrollIntoViewIfNeeded();
    await button('Change world entry type').click(); await page.getByRole('radio', { name: 'New world type: Organization', exact: true }).click(); await noOverflow();
    await page.screenshot({ path: path.join(output, 'type-change-mobile.png'), animations: 'disabled' }); await button('Cancel').click();
    await page.emulateMedia({ colorScheme: 'dark' }); await field('World entry name').scrollIntoViewIfNeeded(); await noOverflow(); await page.screenshot({ path: path.join(output, 'history-dark-mobile.png'), animations: 'disabled' });
    await page.emulateMedia({ colorScheme: 'light' }); await page.setViewportSize({ width: 1640, height: 960 });
  });
  await check('Missing cast is removable; word counts, alias mentions and linked continuity agree', async () => {
    await button(story.title).click(); await button('1. First chapter').click();
    await expect(page.getByText(`${countWords(chapter.html)} words`, { exact: true }).last()).toBeVisible();
    await expect(page.getByText('1 scene · 2 mentions', { exact: true })).toBeVisible();
    await button('Remove missing character deleted-cast from Shore scene').click();
    const saved = await save(); assert.deepEqual(saved.workspace.stories[0].chapters[0].scenes.find((scene) => scene.id === shoreScene.id).characterIds, [character.id]);
    assert.ok(saved.versions.some((version) => version.label === 'Before removing scene context' && version.workspace.stories[0].chapters[0].scenes.find((scene) => scene.id === shoreScene.id).characterIds.includes('deleted-cast')));
    await button('Set current scene to Town scene').click(); const viewed = await save();
    assert.equal(viewed.workspace.stories[0].chapters[0].updatedAt, saved.workspace.stories[0].chapters[0].updatedAt);
    assert.equal(viewed.workspace.stories[0].updatedAt, saved.workspace.stories[0].updatedAt);
    assert.equal(viewed.workspace.stories[0].chapters[0].activeSceneId, townScene.id);
    await button(/Setting continuity/).click();
    const trail = page.getByRole('button', { name: /^Review setting for / });
    assert.deepEqual(await trail.allTextContents().then((items) => items.map((item) => item.match(/\d\. ([^]+?)(?:Coast|Town)/)?.[1])), ['Shore scene', 'Town scene']);
    await expect(button('Review unlinked setting for Unplaced scene')).toBeVisible(); await page.screenshot({ path: path.join(output, 'continuity-desktop.png'), animations: 'disabled' });
  });
  await check('Downloaded backup, reload and explicit history-link removal retain recoverability', async () => {
    const before = await save(), [download] = await Promise.all([page.waitForEvent('download'), button('Download backup').click()]);
    const backupPath = path.join(output, 'verified-backup.json'); await download.saveAs(backupPath);
    assert.deepEqual(JSON.parse(await readFile(backupPath, 'utf8')), before.workspace);
    await page.reload(); await section('World Building'); await page.getByText('The Flood', { exact: true }).click();
    await expect(button('Open history Groups involved: House Silver')).toBeVisible();
    await button('Remove history Groups involved: House Silver').click(); const saved = await save();
    assert.deepEqual(saved.workspace.stories[0].worldbuilding.find((item) => item.id === history.id).worldProfile.participantGroupIds, []);
    assert.ok(saved.versions.some((version) => version.label === 'Before removing history link' && version.workspace.stories[0].worldbuilding.find((item) => item.id === history.id).worldProfile.participantGroupIds.includes(family.id)));
  });
  assert.deepEqual(errors, []);
} catch (error) { errors.push(error.stack ?? String(error)); process.exitCode = 1; }
finally {
  await writeFile(path.join(output, 'ui-results.json'), JSON.stringify({ checks, errors, output, limitations: ['Fresh headless Chrome context with a fixture imported through the real UI; real writer storage is never opened.', 'Desktop process/restart/export checks are recorded by the separate full validation runner.'] }, null, 2));
  if (browser) await browser.close();
  console.log(`Audit evidence: ${output}`);
}
