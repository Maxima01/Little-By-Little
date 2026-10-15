import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline/promises';
import { _electron as electron, expect as baseExpect } from '@playwright/test';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { CHARACTERS, WORLD, ENTRY_REVISION, STORY_TITLE, PREMISE, chapterTitle, chapterBody, wordCount, normalized, htmlText } from './desktop-fixtures.mjs';

// Feature: terminal flags control visible pacing and inspection without reducing the ten-chapter workload.
const flags = new Set(process.argv.slice(2));
const supported = new Set(['--fast', '--keep-open', '--pause', '--live-lookups', '--help']);
for (const flag of flags) if (!supported.has(flag)) throw new Error(`Unknown option: ${flag}. Use --help.`);
if (flags.has('--help')) {
  console.log('Desktop validation: 10 chapters x 2,500 words, real Electron UI, isolated storage.\nOptions: --fast (no demonstration delays), --pause (Enter between checks), --keep-open (inspect before closing), --live-lookups (also check external dictionary providers).\nRun npm run test:desktop to build first; test:desktop:reuse uses the current dist build.');
  process.exit(0);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const output = path.join(root, '.local-checks', 'desktop', runId);
const profile = path.join(output, 'profile');
const screenshots = path.join(output, 'screenshots');
const exportsDir = path.join(output, 'exports');
const fast = flags.has('--fast');
// Feature: unattended checks can use hidden isolated windows while preserving all workflow and storage assertions.
const hidden = process.env.NOVEL_DESKTOP_TEST_HIDDEN === '1';
const results = [];
const runtimeErrors = [];
const consoleMessages = [];
const expectedBodies = new Map(Array.from({ length: 10 }, (_, i) => [chapterTitle(i + 1), chapterBody(i + 1)]));
let desktop;
let page;
let traceNumber = 0;
let currentStep = 'startup';
let interrupted = false;
let finishing;
let finishedAt = null;
const startedAt = new Date().toISOString();
const input = flags.has('--pause') || flags.has('--keep-open') ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
const expect = baseExpect.configure({ timeout: 15_000 });

// Feature: retain incremental HTML/JSON evidence even when a workflow fails or the run is interrupted.
// Feature: escape report values so captured errors or fixture text cannot become executable HTML.
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function report(done = false) {
  // Feature: an interrupt cannot turn a completed report back into an auto-refreshing in-progress report.
  if (done) finishedAt ??= new Date().toISOString();
  done = finishedAt !== null;
  const counts = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map((status) => [status, results.filter((item) => item.status === status).length]));
  const data = { startedAt, finishedAt, interrupted, output, profile, counts, results, runtimeErrors, consoleMessages,
    limitations: ['This launches the production Electron entry point and built dist renderer, not an installer.', 'Native PDF save-dialog selection is automated; the production preload, IPC, renderer and file write remain real.', 'Default dictionary/thesaurus responses are controlled fixtures; --live-lookups adds external provider validation.', 'This is workflow validation, not a performance benchmark or a guarantee that every bug is covered.'] };
  await writeFile(path.join(output, 'results.json'), JSON.stringify(data, null, 2));
  await writeFile(path.join(output, 'report.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Desktop validation</title>${done ? '' : '<meta http-equiv="refresh" content="5">'}<style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;color:#202532}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd0d8;padding:12px;text-align:left;vertical-align:top}.PASS{color:#17663b}.FAIL{color:#a22121}.BLOCKED{color:#855e0b}pre{white-space:pre-wrap;max-width:700px;font-size:13px}small{color:#586274}a{color:#245ea0}</style><h1>Desktop validation ${done ? 'results' : 'in progress'}</h1><p>${counts.PASS} passed · ${counts.FAIL} failed · ${counts.BLOCKED} blocked${interrupted ? ' · INTERRUPTED' : ''}</p><p>10 chapters × 2,500 words. Isolated test profile retained at <code>${escape(profile)}</code>.</p><table><thead><tr><th>Check</th><th>Result</th><th>Evidence</th></tr></thead><tbody>${results.map((r) => `<tr><td>${escape(r.name)}<br><small>${(r.durationMs / 1000).toFixed(1)}s</small></td><td class="${r.status}">${r.status}</td><td>${r.screenshot ? `<a href="${escape(r.screenshot)}">Screenshot</a>` : ''}${r.detail ? `<p>${escape(r.detail)}</p>` : ''}${r.error ? `<details open><summary>Failure</summary><pre>${escape(r.error)}</pre></details>` : ''}</td></tr>`).join('')}</tbody></table><h2>Coverage limits</h2><ul>${data.limitations.map((text) => `<li>${escape(text)}</li>`).join('')}</ul><p><a href="results.json">JSON details</a> · <a href="exports/">Exports and backup</a></p></html>`);
}

// Feature: treat dependent failures as blocked, continue independent workflows, and return a failing terminal exit code.
async function check(name, action, dependencies = []) {
  if (interrupted) return;
  currentStep = name;
  const row = { name, status: 'BLOCKED', durationMs: 0 };
  const missing = dependencies.filter((dep) => !results.some((r) => r.name === dep && r.status === 'PASS'));
  if (missing.length) {
    row.detail = `Prerequisite failed or blocked: ${missing.join(', ')}`;
    results.push(row); console.log(`BLOCKED ${name}: ${row.detail}`); await report(); return;
  }
  console.log(`\nRUN  ${name}`);
  const begin = Date.now();
  try {
    if (flags.has('--pause')) await input.question('Press Enter to run this check... ');
    row.detail = await action() || 'Validated.';
    if (!fast) await delay(650);
    row.status = 'PASS';
  } catch (error) { row.status = 'FAIL'; row.error = error.stack ?? String(error); }
  row.durationMs = Date.now() - begin;
  if (page && !page.isClosed()) {
    const filename = `${String(results.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 90)}.png`;
    try { await page.screenshot({ path: path.join(screenshots, filename), timeout: 5000 }); row.screenshot = `screenshots/${filename}`; }
    catch (error) { row.evidenceError = String(error); }
  }
  results.push(row);
  console.log(`${row.status} ${name}${row.error ? `\n  ${row.error.split('\n')[0]}` : ` — ${row.detail}`}`);
  await report();
}

// Feature: launch visible production Electron with isolated user/session storage, console capture and a replayable trace.
async function launch() {
  const env = { ...process.env, NOVEL_DESKTOP_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  desktop = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [path.join(root, 'scripts/desktop-validation-main.cjs')], cwd: root, env, timeout: 45_000, slowMo: fast ? 0 : 100, acceptDownloads: true, chromiumSandbox: true });
  desktop.on('console', (message) => consoleMessages.push({ process: 'main', step: currentStep, type: message.type(), text: message.text() }));
  page = await desktop.firstWindow();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => runtimeErrors.push({ step: currentStep, message: error.stack ?? String(error) }));
  page.on('console', (message) => consoleMessages.push({ process: 'renderer', step: currentStep, type: message.type(), text: message.text() }));
  page.on('crash', () => runtimeErrors.push({ step: currentStep, message: 'Renderer crashed.' }));
  await desktop.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
  await expect(page.getByRole('button', { name: 'Start my story', exact: true })).toBeVisible();
}
// Feature: stop each process cleanly and save its trace before restarting the same test profile.
async function closeDesktop() {
  if (!desktop) return;
  const instance = desktop;
  desktop = undefined;
  try { await instance.context().tracing.stop({ path: path.join(output, `trace-${++traceNumber}.zip`) }); }
  finally {
    // Feature: explicit test cleanup may close even after a failed step left an unsaved navigation change.
    // The normal app's unload checks still run during the workflow; this override exists only while quitting.
    await instance.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.once('will-prevent-unload', (event) => event.preventDefault());
    });
    await instance.close();
  }
}

// Feature: inspect committed IndexedDB records read-only, so a green save label alone cannot produce a pass.
async function savedRecord() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('little-by-little', 1);
    request.onerror = () => reject(new Error('Cannot read desktop IndexedDB.'));
    request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Desktop storage was not initialized.')); };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('workspace', 'readonly');
      const read = transaction.objectStore('workspace').get('little-by-little.workspace.v1');
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => { db.close(); reject(new Error('Desktop storage inspection failed.')); };
      read.onsuccess = () => { try { resolve(read.result ? JSON.parse(read.result) : null); } catch (error) { reject(error); } };
    };
  }));
}
// Feature: wait for the actual saved record to satisfy a workflow invariant, with a bounded timeout.
async function persisted(predicate) { await expect.poll(async () => predicate(await savedRecord()), { timeout: 20_000, intervals: [150, 300, 600] }).toBeTruthy(); return savedRecord(); }
// Feature: scope storage assertions to the newly created validation story, keeping the example story separate.
const storyOf = (record) => record?.workspace?.stories.find((story) => story.title === STORY_TITLE);
// Feature: locate a retained validation chapter by its stable title after navigation or restart.
const chapterOf = (record, number = 1) => storyOf(record)?.chapters.find((chapter) => chapter.title === chapterTitle(number));
// Feature: prefer accessible button names, accepting a regex when the control includes extra display text.
const button = (name) => page.getByRole('button', { name, exact: typeof name === 'string' });
// Feature: target inputs by their public accessibility labels rather than implementation-specific selectors.
const field = (name) => page.getByRole('textbox', { name, exact: true });
// Feature: use the real contenteditable manuscript as the source of every simulated writing action.
const editor = () => field('Chapter text editor');
// Feature: restrict revision assertions to the open dialog instead of the underlying story screen.
const revision = () => page.getByRole('dialog', { name: 'Revision tools', exact: true });

// Feature: wait for a modal's focus trap and fade animation to finish before the next editing action.
async function closeDialog(name) {
  const control = button(name);
  await control.click();
  await expect(control).toHaveCount(0);
}
// Feature: close tool dialogs between independent scenarios so one failure cannot obscure unrelated checks.
async function dismissDialogs() {
  for (const name of ['Close preview', 'Close writing tools', 'Close export options', 'Close setting picker', 'Close chapter context', 'Close version history', 'Close formatting menu', 'Close']) {
    const control = button(name);
    if (await control.count() === 1 && await control.isVisible()) await closeDialog(name);
  }
}
// Feature: navigate by the app's real sidebar and accessible labels rather than manipulating application state.
async function openStory() { await dismissDialogs(); await button(STORY_TITLE).click(); await expect(field('Story title')).toHaveValue(STORY_TITLE); }
// Feature: open a chapter through its numbered sidebar item and verify the destination title.
async function openChapter(number = 1) {
  await openStory();
  await button(new RegExp(`^\\d+\\. ${chapterTitle(number)}$`)).click();
  await expect(field('Chapter title')).toHaveValue(chapterTitle(number));
}
// Feature: send normal editor input in visible paragraph batches; fixtures are never injected into the database.
async function writeBody(text, replace = false) {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Feature: clear through the editable control, avoiding Electron's window-wide Select All menu accelerator.
  if (replace) await editor().fill('');
  await editor().focus();
  await expect(editor()).toBeFocused();
  const paragraphs = text.split('\n\n');
  for (let i = 0; i < paragraphs.length; i++) {
    await editor().focus();
    await page.keyboard.insertText((i ? '\n\n' : '') + paragraphs[i]);
    if (!fast) await delay(45);
  }
  await expect.poll(async () => normalized(await editor().innerText())).toBe(normalized(text));
}
// Feature: select actual manuscript text using keyboard shortcuts for formatting, comments and scene links.
async function selectOpening() { await editor().focus(); await expect(editor()).toBeFocused(); await editor().press('ControlOrMeta+Home'); await editor().press('ControlOrMeta+Shift+ArrowRight'); }
// Feature: open a specific revision tool tab through the same controls the writer sees.
async function openRevision(tab) { await button('Revision tools').click(); await page.getByRole('tab', { name: tab, exact: true }).click(); }
// Feature: saved checkpoints and download assertions use the same UI commands available to writers.
async function saveNow() { await button('Save now').click(); await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible(); }
// Feature: retain actual UI-triggered downloads and reject interrupted or unsuccessful file transfers.
async function download(action, filename) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 25_000 }), action()]);
  const destination = path.join(exportsDir, filename ?? file.suggestedFilename());
  await file.saveAs(destination);
  assert.equal(await file.failure(), null);
  return destination;
}

// Feature: create and then edit detailed profiles in every character/world category, validating all saved fields.
async function createEntry(section, entry) {
  await openStory();
  await button(new RegExp(`\\b${section}\\b`)).click();
  await button(section === 'Characters' ? '＋ New character' : '＋ New worldbuilding entry').click();
  await field('New entry title').fill(entry.title);
  await button(entry.category).click();
  await field('New entry notes').fill(entry.content);
  await button('Create').click();
  // Feature: both character and world dossiers preserve their original notes in the detailed-description tab.
  await page.getByRole('tab', { name: 'Detailed description', exact: true }).click();
  await field('Detailed description').fill(entry.content + ENTRY_REVISION);
  const key = section === 'Characters' ? 'characters' : 'worldbuilding';
  await persisted((record) => storyOf(record)?.[key].some((saved) => saved.title === entry.title && saved.category === entry.category && saved.content === entry.content + ENTRY_REVISION));
  return `${entry.category} profile created, edited and committed.`;
}
// Feature: assign setting/cast and continuity notes through the scene tracker, including checked-state assertions.
async function setScene(number, second = false) {
  if (await button('Show context').isVisible()) await button('Show context').click();
  if (second) await button('Add scene').click();
  const title = `${second ? 'Archive discovery' : 'Harbor arrival'} ${String(number).padStart(2, '0')}`;
  await field('Scene name').fill(title);
  await button('Choose scene setting').click();
  await button(second ? 'Old archive' : 'Bellhaven').click();
  const cast = second ? ['Mira', 'Talia'] : ['Mira', 'Rowan'];
  for (const name of cast) {
    const choice = page.getByRole('checkbox', { name: new RegExp(name) });
    if (await choice.getAttribute('aria-checked') !== 'true') await choice.click();
    await expect(choice).toBeChecked();
  }
  const continuity = button(/^Setting continuity/);
  if (await continuity.getAttribute('aria-expanded') !== 'true') await continuity.click();
  const notes = `${second ? 'Evening at the archive' : 'Morning fog at the harbor'}; copper key remains with Mira; chapter ${number}.`;
  await field('Scene continuity notes').fill(notes);
  await persisted((record) => {
    const story = storyOf(record); const scene = chapterOf(record, number)?.scenes.find((item) => item.title === title);
    return scene?.continuityNotes === notes && story.worldbuilding.find((entry) => entry.id === scene.settingId)?.title === (second ? 'Old archive' : 'Bellhaven') && scene.characterIds.length === cast.length && cast.every((name) => scene.characterIds.includes(story.characters.find((entry) => entry.title === name).id));
  });
  // Feature: continuity now requires confirmed manuscript positions, so link each test scene through its actual UI.
  await selectOpening();
  if (second) { await editor().press('ControlOrMeta+End'); await editor().press('ControlOrMeta+Shift+ArrowLeft'); }
  await openRevision('Scene outline');
  const card = field(`${title} viewpoint`).locator('..').locator('..');
  await card.getByRole('button', { name: 'Link to selected passage', exact: true }).click();
  await closeDialog('Close');
  await persisted((record) => chapterOf(record, number)?.scenes.find((item) => item.title === title)?.anchor?.quote.includes(second ? `END${String(number).padStart(2, '0')}` : `START${String(number).padStart(2, '0')}`));
}

// Feature: check exported manuscript bodies, not only file signatures or success messages.
async function exportChapter(format, label, exportButton) {
  await openChapter(); await button('Export').click();
  await expect(page.getByRole('radio', { name: 'This chapter', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: label }).click();
  const destination = await download(() => button(exportButton).click(), `chapter-01.${format}`);
  const bytes = await readFile(destination);
  let text;
  if (format === 'docx' || format === 'epub') {
    const zip = await JSZip.loadAsync(bytes);
    if (format === 'docx') {
      const xml = new JSDOM(await zip.file('word/document.xml').async('string'), { contentType: 'text/xml' }).window.document;
      text = [...xml.getElementsByTagName('w:p')].map((p) => [...p.getElementsByTagName('w:t')].map((t) => t.textContent).join('')).join(' ');
    } else {
      const files = Object.values(zip.files).filter((file) => /\.xhtml$/.test(file.name));
      const pages = await Promise.all(files.map((file) => file.async('string')));
      const chapters = pages.filter((body) => body.includes('START01'));
      assert.equal(chapters.length, 1, 'EPUB must contain the exported chapter once.');
      text = htmlText(chapters[0]);
    }
  } else text = format === 'html' ? htmlText(bytes.toString('utf8')) : bytes.toString('utf8').replace(/[*_#]/g, '');
  assert.ok(normalized(text).includes(normalized(expectedBodies.get(chapterTitle(1)))), `${format.toUpperCase()} lost or changed chapter content.`);
  assert.ok(!text.includes('START02'), 'A single-chapter export included another chapter.');
  await closeDialog('Close export options');
  return `${format.toUpperCase()} file saved; all 2,500 words and chapter scope verified.`;
}

// Feature: finish or interrupt a run with retained evidence and a nonzero exit code for failed/blocked checks.
async function finish() {
  if (finishing) return finishing;
  finishing = (async () => {
    try { await closeDesktop(); } catch (error) { results.push({ name: 'Close desktop and retain trace', status: 'FAIL', error: String(error), durationMs: 0 }); }
    input?.close();
    await report(true);
    const failed = interrupted || results.some((r) => r.status !== 'PASS');
    console.log(`Summary: ${results.filter((r) => r.status === 'PASS').length} passed, ${results.filter((r) => r.status === 'FAIL').length} failed, ${results.filter((r) => r.status === 'BLOCKED').length} blocked.`);
    console.log(`\n${failed ? 'DESKTOP VALIDATION FAILED' : 'DESKTOP VALIDATION PASSED'}\nReport: ${path.join(output, 'report.html')}\nJSON:   ${path.join(output, 'results.json')}\nTest data and exports retained: ${output}`);
    process.exitCode = failed ? 1 : 0;
  })();
  return finishing;
}
process.once('SIGINT', () => { interrupted = true; console.log('\nInterrupted; saving evidence and closing the test app.'); void finish(); });

try {
  await mkdir(screenshots, { recursive: true }); await mkdir(exportsDir, { recursive: true });
  await report();
  console.log(`\n${hidden ? 'Hidden' : 'Visible'} desktop validation: 10 chapters × 2,500 words\nReport: ${path.join(output, 'report.html')}\nUse Ctrl+C to stop. Avoid clicking/typewriting in the automated window while it runs.\n`);
  await check('Launch built desktop and verify isolation', async () => {
    await access(path.join(root, 'dist/index.html'));
    await launch();
    assert.ok(page.url().startsWith('file:'), 'Expected the built desktop renderer.');
    const state = await desktop.evaluate(({ app, BrowserWindow }) => ({ profile: app.getPath('userData'), session: app.getPath('sessionData'), visible: BrowserWindow.getAllWindows()[0].isVisible(), preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences() }));
    assert.equal(path.resolve(state.profile), profile); assert.equal(path.resolve(state.session), profile); assert.equal(state.visible, !hidden);
    assert.equal(state.preferences.contextIsolation, true); assert.equal(state.preferences.nodeIntegration, false); assert.equal(state.preferences.sandbox, true);
    assert.equal(await page.evaluate(() => typeof window.novelDesktop?.exportPdf), 'function');
    return `${hidden ? 'Hidden' : 'Visible'} Electron window, built file renderer, sandboxed preload and isolated storage confirmed.`;
  });
  const startup = ['Launch built desktop and verify isolation'];
  await check('Create story and validate empty title', async () => {
    await button('Start my story').click(); await button('Create').click();
    await expect(page.getByRole('alert')).toContainText('Enter a title');
    await field('New story title').fill(STORY_TITLE); await field('New story premise or description').fill(PREMISE); await button('Create').click();
    await expect(editor()).toBeVisible();
    await persisted((record) => storyOf(record)?.description === PREMISE && storyOf(record).chapters.length === 1);
    return 'Title validation, premise and first blank chapter verified.';
  }, startup);
  const storyReady = ['Create story and validate empty title'];
  for (const entry of CHARACTERS) await check(`Character: ${entry.title} (${entry.category})`, () => createEntry('Characters', entry), storyReady);
  for (const entry of WORLD) await check(`World building: ${entry.title} (${entry.category})`, () => createEntry('World Building', entry), storyReady);
  for (let number = 1; number <= 10; number++) {
    await check(`Chapter ${number}: write 2500 words`, async () => {
      await openStory();
      if (number === 1) {
        await button('1. Chapter 1').click(); await field('Chapter title').fill(chapterTitle(1));
      } else {
        await button('＋  Add a chapter').click(); await field('New chapter title').fill(chapterTitle(number)); await button('Create').click();
      }
      const body = expectedBodies.get(chapterTitle(number));
      assert.equal(wordCount(body), 2500);
      await writeBody(body);
      await persisted((record) => htmlText(chapterOf(record, number)?.html ?? '') === normalized(body));
      await expect(page.getByText('2500 words', { exact: true })).toBeVisible();
      return '2,500 words entered through the editor; full saved body and visible word count agree.';
    }, storyReady);
    await check(`Chapter ${number}: scene context tracker`, async () => {
      await openChapter(number); await setScene(number);
      if (number <= 2) await setScene(number, true);
      if (number === 2) await expect(page.getByText(/Previous chapter: Validation Chapter 01/)).toBeVisible();
      return `Scene setting, checked cast and continuity notes saved${number <= 2 ? '; two scenes and location change exercised' : ''}.`;
    }, [`Chapter ${number}: write 2500 words`, 'Character: Mira (Major)', 'Character: Rowan (Major)', 'Character: Talia (Side character)', 'World building: Bellhaven (Setting)', 'World building: Old archive (Setting)']);
  }
  const firstChapter = ['Chapter 1: write 2500 words'];
  const allChapters = Array.from({ length: 10 }, (_, i) => `Chapter ${i + 1}: write 2500 words`);
  await check('Scene tracker: cast ledger and setting transition', async () => {
    await openChapter();
    if (await button('Show context').isVisible()) await button('Show context').click();
    const ledger = button(/^Character appearances/);
    if (await ledger.getAttribute('aria-expanded') !== 'true') await ledger.click();
    const body = expectedBodies.get(chapterTitle(1));
    for (const [name, scenes] of [['Mira', 2], ['Rowan', 1], ['Soren', 0], ['Talia', 1]]) {
      const mentions = [...body.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].length;
      await expect(page.getByText(name, { exact: true }).locator('..')).toContainText(`${scenes} ${scenes === 1 ? 'scene' : 'scenes'} · ${mentions} ${mentions === 1 ? 'mention' : 'mentions'}`);
    }
    const continuity = button(/^Setting continuity/);
    if (await continuity.getAttribute('aria-expanded') !== 'true') await continuity.click();
    await expect(page.getByText('Location change from Bellhaven', { exact: true })).toBeVisible();
    return 'Rendered cast ledger matches independent scene/mention counts; Bellhaven-to-archive change displayed.';
  }, ['Chapter 1: scene context tracker']);
  await check('All ten chapters: 25000 words and unique bodies', async () => {
    const story = storyOf(await savedRecord()); assert.equal(story.chapters.length, 10);
    for (let n = 1; n <= 10; n++) { const chapter = story.chapters[n - 1]; assert.equal(chapter.title, chapterTitle(n)); assert.equal(wordCount(htmlText(chapter.html)), 2500); assert.equal(htmlText(chapter.html), normalized(expectedBodies.get(chapter.title))); }
    await openStory(); return 'Ten distinct chapters in order, all exact bodies and 25,000 total words verified.';
  }, allChapters);
  await check('Proofreading: apply a real correction', async () => {
    await openChapter();
    try {
      await writeBody('Mira carried the the lantern.', true); await button('Writing tools').click();
      const grammar = page.getByRole('switch', { name: 'Grammar suggestions' }); if (!await grammar.isChecked()) await grammar.click();
      await button(/^Apply Repeated word at character/).click(); await closeDialog('Close writing tools');
      await expect(editor()).toHaveText('Mira carried the lantern.');
    } finally { await dismissDialogs(); await writeBody(expectedBodies.get(chapterTitle(1)), true); await saveNow(); }
    return 'Repeated-word suggestion applied to manuscript; full 2,500-word chapter restored through the UI.';
  }, firstChapter);
  await check('Prose analysis: configure and persist signals', async () => {
    await openChapter(); await button('Writing tools').click(); await page.getByRole('tab', { name: 'Prose analysis', exact: true }).click();
    await button('150 words').click(); await button('50 words').click(); await field('Prose phrases to watch').fill('the river\ncedar chest');
    await expect(page.getByText(/estimated sentences · average/)).toBeVisible();
    await persisted((record) => storyOf(record)?.prosePreferences?.windowWords === 150 && storyOf(record)?.prosePreferences?.longSentenceWords === 50 && storyOf(record)?.prosePreferences?.overusedPhrases.join('|') === 'the river|cedar chest');
    await closeDialog('Close writing tools'); return 'Analysis displayed and all configured thresholds/phrases committed.';
  }, firstChapter);
  await check('Dictionary and thesaurus: controlled lookup and offline feedback', async () => {
    await openChapter();
    const providers = /https:\/\/(freedictionaryapi\.com|api\.dictionaryapi\.dev|api\.datamuse\.com)\//;
    try {
      await page.route(providers, (route) => route.fulfill({ json: route.request().url().includes('datamuse') ? [{ word: 'calm' }] : { entries: [{ partOfSpeech: 'adjective', senses: [{ definition: 'Making little or no noise in the validation fixture.' }] }] } }));
      await button('Writing tools').click(); await page.getByRole('tab', { name: 'Dictionary & thesaurus', exact: true }).click(); await field('Dictionary word').fill('quiet'); await button('Search').click();
      await expect(page.getByText('Making little or no noise in the validation fixture.', { exact: true })).toBeVisible(); await expect(button('Look up calm')).toBeVisible();
      await page.unroute(providers); await page.route(providers, (route) => route.abort()); await field('Dictionary word').fill('storm'); await button('Search').click();
      await expect(page.getByText('Dictionary unavailable. Check your connection and try again.', { exact: true })).toBeVisible();
      await expect(page.getByText('Thesaurus unavailable. Check your connection and try again.', { exact: true })).toBeVisible();
    } finally { await page.unroute(providers); await dismissDialogs(); }
    return 'Fixture definition/synonym rendered; both unavailable-provider messages verified. External service uptime is not asserted.';
  }, firstChapter);
  if (flags.has('--live-lookups')) await check('Live external dictionary and thesaurus', async () => {
    await openChapter(); await button('Writing tools').click(); await page.getByRole('tab', { name: 'Dictionary & thesaurus', exact: true }).click(); await field('Dictionary word').fill('lantern'); await button('Search').click();
    await expect(button('Refresh lookup')).toBeVisible({ timeout: 25_000 });
    assert.equal(await page.getByText('Definitions could not be loaded.', { exact: true }).count(), 0, 'Live dictionary was unavailable.');
    assert.ok(await button(/^Look up /).count() > 0, 'Live thesaurus returned no synonyms.');
    await closeDialog('Close writing tools'); return 'Real provider definition and synonyms received.';
  }, firstChapter);
  await check('Rich formatting, typography, undo and redo', async () => {
    await openChapter(); await selectOpening(); await button('Bold').click(); await button('Italic').click(); await button('Underline').click();
    await expect(editor().locator('b,strong')).toContainText('START01'); await expect(editor().locator('i,em')).toContainText('START01'); await expect(editor().locator('u')).toContainText('START01');
    await button('Undo').click(); await expect(editor().locator('u')).toHaveCount(0); await button('Redo').click(); await expect(editor().locator('u')).toContainText('START01');
    await button('Font: Georgia').click(); await button('Arial · Clean').click(); await button('Font size: 16').click(); await button('18').click();
    await persisted((record) => chapterOf(record)?.fontFamily === 'Arial' && chapterOf(record)?.fontSize === 18 && /<(b|strong)>/.test(chapterOf(record)?.html));
    assert.equal(normalized(await editor().innerText()), normalized(expectedBodies.get(chapterTitle(1))));
    return 'Bold, italic, underline, undo/redo and saved font family/size verified without losing words.';
  }, firstChapter);
  await check('Find and replace: chapter and story scopes', async () => {
    await openChapter(); await openRevision('Find & replace'); await field('Find text').fill('lost relic'); await field('Replace with').fill('lost artifact');
    await expect(revision().getByText('1 results · 1 of 1', { exact: true })).toBeVisible(); await button('Replace this result').click();
    await expect(page.getByText('1 replacement saved. The earlier draft is in chapter revisions.', { exact: true })).toBeVisible();
    expectedBodies.set(chapterTitle(1), expectedBodies.get(chapterTitle(1)).replace('lost relic', 'lost artifact'));
    await persisted((record) => htmlText(chapterOf(record)?.html ?? '') === normalized(expectedBodies.get(chapterTitle(1))));
    await revision().getByRole('radio', { name: 'Entire story', exact: true }).click(); await field('Find text').fill('START');
    await expect(revision().getByText('10 results · 1 of 10', { exact: true })).toBeVisible(); await closeDialog('Close');
    return 'Reviewed replacement saved after checkpoint; all ten chapters found by story-wide search.';
  }, ['All ten chapters: 25000 words and unique bodies']);
  await check('Passage task: attach, edit and complete', async () => {
    await openChapter(); await selectOpening(); await openRevision('Passage tasks'); await field('New passage comment or revision task').fill('Check the opening image.'); await button('Attach passage task').click();
    await field('Task 1 note').fill('Opening image checked against the harbor setting.'); await button('Mark completed').click();
    await expect(revision().getByText('0 unresolved tasks', { exact: true })).toBeVisible();
    await persisted((record) => chapterOf(record)?.passageTasks?.some((task) => task.completed && task.note === 'Opening image checked against the harbor setting.' && task.anchor.quote.includes('START01')));
    await closeDialog('Close'); return 'Task anchored to selected manuscript, edited, completed and saved.';
  }, firstChapter);
  await check('Scene outline: link passage and metadata', async () => {
    await openChapter(); await selectOpening(); await openRevision('Scene outline');
    await button('Link to selected passage').first().click(); await field('Harbor arrival 01 viewpoint').fill('Mira'); await field('Harbor arrival 01 synopsis').fill('The travelers arrive to seek the lost treaty.');
    await persisted((record) => chapterOf(record)?.scenes[0]?.anchor?.quote.includes('START01') && chapterOf(record).scenes[0].viewpoint === 'Mira' && chapterOf(record).scenes[0].synopsis === 'The travelers arrive to seek the lost treaty.');
    await closeDialog('Close'); return 'First scene linked to real selected text; viewpoint and synopsis persisted.';
  }, ['Chapter 1: scene context tracker']);
  await check('Style guide: character alias and reference notes', async () => {
    await openChapter(); await openRevision('Project style guide'); await page.getByRole('radio', { name: 'Character aliases', exact: true }).click(); await page.getByRole('radio', { name: 'Mira', exact: true }).click();
    await field('Accepted aliases or forms (comma separated)').fill('Keeper'); await field('Rule explanation (optional)').fill('Mira is called Keeper at the archive.'); await button('Add style rule').click(); await field('Style guide reference notes').fill('Use river town vocabulary and keep the travel distances consistent.');
    await persisted((record) => storyOf(record)?.styleGuide?.rules.some((rule) => rule.kind === 'alias' && rule.preferred === 'Mira' && rule.variants.includes('Keeper') && rule.characterId === storyOf(record).characters.find((c) => c.title === 'Mira').id) && storyOf(record).styleGuide.conventions.includes('travel distances'));
    await closeDialog('Close'); return 'Alias linked to character profile; explanation and story conventions retained.';
  }, [...firstChapter, 'Character: Mira (Major)']);
  await check('Targets, release status and named checkpoint', async () => {
    await openChapter(); await openRevision('Targets & release buffer'); await field('Session word target').fill('500'); await button('Start new writing session').click(); await field('Current chapter word target').fill('2500'); await button('Set chapter target').click();
    await page.getByRole('radio', { name: 'Completed / ready', exact: true }).first().click(); await field(`${chapterTitle(1)} release date (YYYY-MM-DD)`).fill('2030-01-15'); await button('Save release date').first().click();
    await persisted((record) => chapterOf(record)?.chapterGoal === 2500 && chapterOf(record)?.releaseStatus === 'complete' && chapterOf(record)?.releaseDate === '2030-01-15' && storyOf(record)?.sessionGoal?.target === 500);
    await page.getByRole('tab', { name: 'Chapter revisions', exact: true }).click(); await field('Checkpoint name').fill('Desktop validation complete manuscript'); await button('Create named checkpoint').click(); await expect(page.getByText('Named checkpoint saved.', { exact: true })).toBeVisible();
    await persisted((record) => record.versions.some((version) => version.label.includes('Desktop validation complete manuscript'))); await closeDialog('Close');
    return 'Session/chapter targets, release date/status and named retained revision verified.';
  }, firstChapter);
  await check('Preview: complete EPUB and PDF estimate bodies', async () => {
    await openChapter(); await button('Preview').click();
    assert.equal(normalized(await page.locator('.writer-preview-body').innerText()), normalized(expectedBodies.get(chapterTitle(1))));
    await page.getByRole('tab', { name: 'PDF estimate', exact: true }).click();
    assert.equal(normalized((await page.locator('.writer-preview-body').allInnerTexts()).join(' ')), normalized(expectedBodies.get(chapterTitle(1))));
    await closeDialog('Close preview'); return 'Both preview modes preserve every word, including opening and ending markers.';
  }, firstChapter);
  for (const [format, label, command] of [['txt', /^Plain text/, 'Export TXT'], ['md', /^Markdown/, 'Export MD'], ['html', /^HTML/, 'Export HTML'], ['docx', /^Word/, 'Export Word'], ['epub', /^EPUB/, 'Export EPUB']]) await check(`Export chapter: ${format.toUpperCase()}`, () => exportChapter(format, label, command), firstChapter);
  await check('Export chapter: desktop PDF through preload and IPC', async () => {
    await openChapter(); await button('Export').click(); const destination = path.join(exportsDir, 'chapter-01.pdf');
    await desktop.evaluate(({ dialog }, filePath) => { global.__validationSaveDialog = dialog.showSaveDialog; dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, destination);
    try { await button('Export PDF').click(); await expect(page.getByText('PDF saved.', { exact: true })).toBeVisible({ timeout: 30_000 }); }
    finally { await desktop.evaluate(({ dialog }) => { dialog.showSaveDialog = global.__validationSaveDialog; delete global.__validationSaveDialog; }); }
    const bytes = await readFile(destination); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const pdf = await loadingTask.promise;
    try {
      const texts = [];
      for (let n = 1; n <= pdf.numPages; n++) texts.push((await (await pdf.getPage(n)).getTextContent()).items.map((item) => item.str ?? '').join(' '));
      const text = normalized(texts.join(' ')); assert.ok(text.includes(normalized(expectedBodies.get(chapterTitle(1)))), 'PDF lost or changed chapter body.'); assert.ok(!text.includes('START02'), 'PDF included another chapter.');
      await closeDialog('Close export options'); return `Real desktop PDF written (${pdf.numPages} pages); full 2,500-word body verified. Native save-dialog choice automated.`;
    } finally { await loadingTask.destroy(); }
  }, firstChapter);
  await check('Desktop PDF cancellation', async () => {
    await openChapter(); await button('Export').click(); await desktop.evaluate(({ dialog }) => { global.__validationSaveDialog = dialog.showSaveDialog; dialog.showSaveDialog = async () => ({ canceled: true }); });
    try { await button('Export PDF').click(); await expect(page.getByText('PDF export canceled.', { exact: true })).toBeVisible(); }
    finally { await desktop.evaluate(({ dialog }) => { dialog.showSaveDialog = global.__validationSaveDialog; delete global.__validationSaveDialog; }); }
    await closeDialog('Close export options'); return 'Cancellation reported without a false saved message.';
  }, firstChapter);
  let backup;
  await check('Backup: all chapters, characters, world building and scene references', async () => {
    await openChapter(); await saveNow(); const filename = await download(() => button('Download backup').click(), 'workspace-backup.json'); backup = JSON.parse(await readFile(filename, 'utf8'));
    const story = backup.stories.find((s) => s.title === STORY_TITLE); assert.equal(story.chapters.length, 10); assert.equal(story.characters.length, CHARACTERS.length); assert.equal(story.worldbuilding.length, WORLD.length);
    for (const c of story.chapters) assert.equal(htmlText(c.html), normalized(expectedBodies.get(c.title)));
    for (const entry of [...CHARACTERS, ...WORLD]) assert.equal([...story.characters, ...story.worldbuilding].find((saved) => saved.title === entry.title).content, entry.content + ENTRY_REVISION);
    return 'Real downloaded JSON contains every exact manuscript and all edited reference profiles.';
  }, ['All ten chapters: 25000 words and unique bodies', ...CHARACTERS.map((c) => `Character: ${c.title} (${c.category})`), ...WORLD.map((w) => `World building: ${w.title} (${w.category})`)]);
  await check('Close and relaunch: full desktop persistence', async () => {
    await dismissDialogs(); await saveNow(); const before = (await savedRecord()).workspace; await closeDesktop(); await launch();
    assert.deepEqual((await savedRecord()).workspace, before, 'Saved workspace changed or disappeared after restart.');
    await openChapter(); assert.equal(normalized(await editor().innerText()), normalized(expectedBodies.get(chapterTitle(1))));
    return 'A separate Electron process reopened the same isolated profile; every saved workspace field survived.';
  }, ['All ten chapters: 25000 words and unique bodies']);
  await check('Delete chapter: cancel, confirm and retain recovery checkpoint', async () => {
    await openStory(); await button(/\bChapters\b/).click(); await button(`Delete ${chapterTitle(10)}`).click(); await button('Cancel').click();
    assert.equal(storyOf(await savedRecord()).chapters.length, 10);
    await button(`Delete ${chapterTitle(10)}`).click(); await button('Delete').click();
    const record = await persisted((r) => storyOf(r)?.chapters.length === 9); assert.ok(!chapterOf(record, 10));
    const snapshot = record.versions.find((v) => v.label === 'Before deleting chapter'); assert.ok(snapshot, 'Missing checkpoint before chapter deletion.'); assert.equal(wordCount(htmlText(chapterOf({ workspace: snapshot.workspace }, 10).html)), 2500);
    await expect(button(`Delete ${chapterTitle(10)}`)).toHaveCount(0);
    return 'Cancel preserved chapter; confirm removed it; original 2,500-word body remains recoverable in history.';
  }, ['All ten chapters: 25000 words and unique bodies']);
  await check('Restore backup: recover the deleted chapter through import UI', async () => {
    await openStory(); const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button('Import backup').click()]); await chooser.setFiles(path.join(exportsDir, 'workspace-backup.json'));
    await expect(page.getByText('Imported backup', { exact: true })).toBeVisible(); assert.equal(storyOf(await savedRecord()).chapters.length, 9, 'Import preview restored without confirmation.');
    await button('Restore workspace').click();
    const restored = await persisted((record) => storyOf(record)?.chapters.length === 10);
    assert.deepEqual({ ...restored.workspace, updatedAt: backup.updatedAt }, backup, 'Restored backup fields changed (other than the restore timestamp).');
    await openChapter(10); assert.equal(normalized(await editor().innerText()), normalized(expectedBodies.get(chapterTitle(10))));
    return 'Import preview required confirmation; restore recovered all ten chapters and supporting material.';
  }, ['Backup: all chapters, characters, world building and scene references', 'Delete chapter: cancel, confirm and retain recovery checkpoint']);
  await check('Runtime errors and final manuscript integrity', async () => {
    await dismissDialogs(); await saveNow(); const record = await savedRecord(); const story = storyOf(record);
    assert.equal(story.chapters.length, 10); for (const chapter of story.chapters) { assert.equal(wordCount(htmlText(chapter.html)), 2500); assert.equal(htmlText(chapter.html), normalized(expectedBodies.get(chapter.title))); }
    assert.deepEqual(runtimeErrors, [], 'Uncaught renderer errors were captured (see results.json).');
    await openChapter(); await saveNow(); return '25,000 final words intact, with no captured uncaught renderer errors or crashes.';
  }, ['All ten chapters: 25000 words and unique bodies', 'Restore backup: recover the deleted chapter through import UI']);
  await report(true);
  if (flags.has('--keep-open') && !interrupted) await input.question('\nValidation finished. Inspect the test window, then press Enter to close it... ');
} catch (error) {
  results.push({ name: 'Validation runner', status: 'FAIL', durationMs: 0, error: error.stack ?? String(error) }); console.error(error);
} finally { await finish(); }
