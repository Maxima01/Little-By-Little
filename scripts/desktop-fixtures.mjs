import { JSDOM } from 'jsdom';

export const STORY_TITLE = 'Desktop Validation - The Lantern Archive';
export const PREMISE = 'Mira and Rowan recover a lost treaty while Soren and Talia guide them through Bellhaven.';
export const CHARACTERS = [
  { title: 'Mira', category: 'Major', content: 'Role: archive keeper. Goal: recover the treaty. Fear: losing her sister. Voice: precise and gentle. Appearance: copper coat. Relationship: Rowan is her closest ally.' },
  { title: 'Rowan', category: 'Major', content: 'Role: mapmaker. Goal: chart the Lantern road. Flaw: stubborn pride. Voice: dry humor. Appearance: ink stained fingers. Relationship: trusts Mira but challenges her plans.' },
  { title: 'Soren', category: 'Minor', content: 'Role: ferryman. Motivation: protect Bellhaven. Secret: hid the old map. Voice: brief and practical. Relationship: owes Rowan a debt.' },
  { title: 'Talia', category: 'Side character', content: 'Role: market messenger. Goal: find her family. Trait: observant. Voice: energetic. Relationship: brings Mira news from the harbor.' },
];
export const WORLD = [
  { title: 'Bellhaven', category: 'Setting', content: 'Geography: river harbor below steep hills. Weather: cool fog. Culture: lantern festivals. Landmarks: stone quay and bell tower. Travel: one day from the archive.' },
  { title: 'Old archive', category: 'Setting', content: 'Architecture: stone vaults and narrow windows. Atmosphere: dust and cedar. Rules: no open flames near the treaty. Access: copper key carried by Mira.' },
  { title: 'Lantern road', category: 'Setting', content: 'Terrain: forest path with mile stones. Travel: six hours from Bellhaven. Hazard: flooded bridges. Landmark: a silver gate above the ridge.' },
  { title: 'The Long Winter', category: 'History', content: 'Timeline: fifty years before the story. Cause: river ice halted trade. Consequence: the harbor council formed. Present legacy: winter grain stores remain mandatory.' },
  { title: 'The Harbor Treaty', category: 'History', content: 'Timeline: forty years before the story. Signatories: three river towns. Terms: shared ferry rights. Conflict: the original treaty vanished. Plot connection: Mira must recover it.' },
];
export const ENTRY_REVISION = '\nContinuity revision: verified during desktop validation.';
// Feature: keep chapter names stable across creation, navigation, exports and recovery assertions.
export const chapterTitle = (number) => `Validation Chapter ${String(number).padStart(2, '0')}`;

// Feature: count fixture words independently of the app, with the same documented Unicode word boundaries.
export function wordCount(text) { return text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0; }
// Feature: ignore layout whitespace when comparing rich text, exports, and retained drafts.
export function normalized(text) { return text.replace(/\s+/g, ' ').trim(); }
const document = new JSDOM().window.document;
// Feature: decode HTML entities and preserve block boundaries when inspecting saved manuscript HTML.
export function htmlText(html) {
  const container = document.createElement('div');
  container.innerHTML = html.replace(/<br\s*\/?\s*>|<\/(?:p|div|h[1-6]|li|blockquote)>/gi, ' ');
  return normalized(container.textContent ?? '');
}
// Feature: generate exactly 2,500 words per chapter with unique boundary markers and recognizable cast mentions.
export function chapterBody(number) {
  const tag = String(number).padStart(2, '0');
  const opening = `START${tag} Mira and Rowan entered Bellhaven to search for the lost relic. Soren watched the harbor while Talia carried a message toward the Old archive.`;
  const sentences = [
    'A lantern shone beside the river as the travelers studied the map and listened for footsteps beyond the wooden door.',
    'Mira remembered the treaty and asked Rowan to measure the distance between the archive and the silver gate above the ridge.',
    'The keeper opened a cedar chest and found a folded letter beneath a length of blue silk that smelled of rain.',
    'Soren waited near the ferry while Talia counted the bells and watched a pale cloud drift across the eastern hills.',
    'They agreed to carry the letter along the Lantern road before the council gathered to discuss the missing grain stores.',
  ];
  const tokens = opening.split(/\s+/);
  let sentence = 0;
  while (tokens.length < 2499) tokens.push(...sentences[sentence++ % sentences.length].split(/\s+/).slice(0, 2499 - tokens.length));
  tokens.push(`END${tag}`);
  const paragraphs = [];
  for (let i = 0; i < tokens.length; i += 100) paragraphs.push(tokens.slice(i, i + 100).join(' '));
  return paragraphs.join('\n\n');
}
