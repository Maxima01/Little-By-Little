import { mkdir, writeFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createStarterWorkspace } from '../src/domain/model.ts';
import { storyHtml } from '../src/features/workspace/lib/exportDocument.ts';

// Generates a multilingual, formatted PDF fixture through the same manuscript builder as the app.
globalThis.document = new JSDOM().window.document;
const story = createStarterWorkspace().stories[0];
story.title = 'PDF smoke 海';
await mkdir('.local-checks', { recursive: true });
await writeFile('.local-checks/pdf-smoke.html', storyHtml(story));
