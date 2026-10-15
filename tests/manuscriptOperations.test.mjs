import assert from 'node:assert/strict';
import test from 'node:test';
import { anchorText, resolveAnchor, rebaseAnchor, chapterWithHtml, htmlTextMap, findStoryMatches, replaceHtmlText, replaceStoryMatches, sceneRanges } from '../src/features/editor/lib/manuscriptOperations.ts';
import { manuscriptText, chapterCharacterAppearances } from '../src/features/editor/lib/writingAnalysis.ts';
import { createStory, createChapter, createScene, createEntry, DEFAULT_STYLE, DEFAULT_PROSE } from '../src/domain/model.ts';
import { isWorkspace } from '../src/features/workspace/lib/saveHistory.ts';

// Feature: regression fixtures exercise text safety, linked passages and backup compatibility.
function fixture(html = '<p>Mara waited. Mara walked.</p>') {
  const story = createStory('Revision fixture'); const chapter = createChapter('One'); chapter.html = html; story.chapters = [chapter]; return { story, chapter };
}
const options = { query: 'Mara', replacement: 'Nora', wholeWord: true, matchCase: false, scope: 'chapter', chapterId: '' };
test('visible text mapping excludes attributes, comments and executable text while decoding entities', () => {
  const html = '<p title="Mara > secret">M<strong>a</strong>ra &amp; &#x1F600;</p><!--Mara--><style>Mara</style><script>Mara</script><p>Next</p>';
  assert.equal(htmlTextMap(html).text, 'Mara & \u{1F600}\nNext\n');
  assert.equal(manuscriptText(html), htmlTextMap(html).text);
  assert.equal(replaceHtmlText(html, [{ start: 0, end: 4, before: 'Mara', after: '<Nora>&' }]), '<p title="Mara > secret">&lt;Nora&gt;&amp;<strong></strong> &amp; &#x1F600;</p><!--Mara--><style>Mara</style><script>Mara</script><p>Next</p>');
  assert.throws(() => replaceHtmlText(html, [{ start: 8, end: 9, before: '\uDE00', after: '' }]), /complete characters/);
});
test('whole word, case and selection searches remain scoped and results follow chapter order', () => {
  const { story, chapter } = fixture('<p>Mara MARA Marana Mara</p>'); const two = createChapter('Two'); two.html = '<p>Mara</p>'; story.chapters.push(two);
  assert.equal(findStoryMatches(story, { ...options, chapterId: chapter.id }).length, 3);
  assert.equal(findStoryMatches(story, { ...options, chapterId: chapter.id, matchCase: true }).length, 2);
  assert.equal(findStoryMatches(story, { ...options, chapterId: chapter.id, wholeWord: false }).length, 4);
  const selection = anchorText(manuscriptText(chapter.html), 5, 17);
  assert.equal(findStoryMatches(story, { ...options, chapterId: chapter.id, scope: 'selection', selection }).length, 1);
  assert.deepEqual(findStoryMatches(story, { ...options, scope: 'story' }).map((item) => item.chapterTitle), ['One', 'One', 'One', 'Two']);
});
test('bulk edits preserve formatting, metadata and unrelated chapters and reject stale or overlapping edits', () => {
  const { story, chapter } = fixture('<p><b>Mara</b> met <i>Mara</i>.</p>'); const two = createChapter('Two'); story.chapters.push(two);
  chapter.passageTasks = [{ id: 'task', note: 'Motivation', completed: false, createdAt: chapter.updatedAt, anchor: anchorText(manuscriptText(chapter.html), 9, 13) }];
  const matches = findStoryMatches(story, { ...options, replacement: 'Elizabeth', chapterId: chapter.id });
  const next = replaceStoryMatches(story, matches);
  assert.equal(next.chapters[0].html, '<p><b>Elizabeth</b> met <i>Elizabeth</i>.</p>'); assert.equal(next.chapters[1], two);
  assert.equal(next.chapters[0].passageTasks[0].anchor.quote, 'Elizabeth'); assert.equal(next.chapters[0].passageTasks[0].anchor.start, 14);
  assert.throws(() => replaceStoryMatches({ ...story, chapters: [{ ...chapter, html: '<p>Changed.</p>' }, two] }, matches), /draft changed/);
  assert.throws(() => replaceStoryMatches(story, [matches[0], matches[0]]), /overlap/);
  assert.throws(() => replaceHtmlText('<p>One</p><p>Two</p>', [{ start: 0, end: 7, before: 'One\nTwo', after: 'New' }]), /paragraph breaks/);
});
test('passage anchors follow edits and retain deleted/ambiguous tasks for explicit reattachment', () => {
  const anchor = anchorText('Start Mara waits End', 6, 16);
  assert.equal(rebaseAnchor(anchor, 'Start Mara waits End', 'Before Start Mara waits End').start, 13);
  assert.equal(rebaseAnchor(anchor, 'Start Mara waits End', 'Start Mara eagerly waits End').quote, 'Mara eagerly waits');
  const deleted = rebaseAnchor(anchor, 'Start Mara waits End', 'Start  End'); assert.equal(deleted.detached, true); assert.equal(deleted.quote, 'Mara waits');
  assert.equal(rebaseAnchor(deleted, 'Start  End', 'Mara waits elsewhere').detached, true);
  assert.equal(resolveAnchor('Mara waits and Mara waits', { ...anchor, prefix: '', suffix: '' }).detached, true);
});
test('linked scene counts follow manuscript order and both task and scene links rebase on typing', () => {
  const { chapter } = fixture('<p>First scene has four.</p><p>Second scene ends.</p>'); const text = manuscriptText(chapter.html);
  const first = { ...createScene('First'), anchor: anchorText(text, 0, 11) }; const second = { ...createScene('Second'), anchor: anchorText(text, text.indexOf('Second'), text.indexOf('Second') + 12) }; chapter.scenes = [second, first];
  assert.deepEqual(sceneRanges(chapter).map((item) => item.words), [3, 4]);
  const next = chapterWithHtml(chapter, '<p>Before. First scene has four.</p><p>Second scene ends.</p>');
  assert.equal(next.scenes[1].anchor.start, 8); assert.equal(next.scenes[0].anchor.quote, 'Second scene');
});
test('backups accept all editorial metadata and reject corrupt anchors, goals and impossible release dates', () => {
  const { story, chapter } = fixture(); story.styleGuide = { ...DEFAULT_STYLE, rules: [{ id: 's', kind: 'spelling', preferred: 'colour', variants: ['color'], note: '' }] }; story.prosePreferences = DEFAULT_PROSE; story.sessionGoal = { target: 500, baseline: 2, startedAt: story.createdAt };
  chapter.passageTasks = [{ id: 't', note: 'Timeline', completed: false, createdAt: chapter.updatedAt, anchor: anchorText(manuscriptText(chapter.html), 0, 4) }]; chapter.ignoredProofreading = ['rule:duplicate-word']; chapter.chapterGoal = 1000; chapter.releaseStatus = 'complete'; chapter.releaseDate = '2026-10-20';
  const workspace = { version: 1, stories: [story], updatedAt: story.updatedAt };
  assert.equal(isWorkspace(JSON.parse(JSON.stringify(workspace))), true);
  assert.equal(isWorkspace({ ...workspace, stories: [{ ...story, chapters: [{ ...chapter, releaseDate: '2026-02-31' }] }] }), false);
  assert.equal(isWorkspace({ ...workspace, stories: [{ ...story, sessionGoal: { ...story.sessionGoal, target: -5 } }] }), false);
  assert.equal(isWorkspace({ ...workspace, stories: [{ ...story, chapters: [{ ...chapter, passageTasks: [{ ...chapter.passageTasks[0], anchor: { start: 2, end: 1 } }] }] }] }), false);
});
test('character-linked aliases count once even when canonical names overlap shorter aliases', () => {
  const { story, chapter } = fixture('<p>Mara Vale and Mara and The Captain.</p>'); const character = createEntry('Mara Vale', 'Major'); story.characters = [character]; story.styleGuide = { ...DEFAULT_STYLE, rules: [{ id: 'a', kind: 'alias', preferred: 'Mara Vale', variants: ['Mara', 'The Captain'], characterId: character.id, note: '' }] };
  assert.equal(chapterCharacterAppearances(chapter, story)[0].mentions, 3);
});

// Feature: recovering a passage with multiple changes must retain the exact attached name rather than the whole diff span.
test('multiple separated edits in one paragraph keep task and scene anchors on the correct occurrence', () => {
 const {chapter}=fixture('<p>Nora watched the lantern. Nora watched again.</p>');const text=manuscriptText(chapter.html);const start=text.lastIndexOf('Nora');
 chapter.passageTasks=[{id:'t',note:'Motivation',completed:true,createdAt:chapter.updatedAt,anchor:anchorText(text,start,start+4)}];chapter.scenes=[{...createScene('Linked'),anchor:anchorText(text,start,start+4)}];
 const next=chapterWithHtml(chapter,'<p>Mara watched the lantern. Mara watched again.</p>');
 assert.equal(next.passageTasks[0].anchor.quote,'Mara');assert.equal(next.passageTasks[0].anchor.start,start);assert.equal(next.scenes[0].anchor.quote,'Mara');
});

// Feature: a large scoped replacement set preserves every formatted occurrence and the last passage task.
test('large story replacements retain exact metadata anchors without expanding across unchanged passages', () => {
 const {story,chapter}=fixture('<p>'+Array.from({length:1000},(_,i)=>`<b>Mara</b> watches lantern ${i}.`).join(' ')+'</p>');const text=manuscriptText(chapter.html);const start=text.lastIndexOf('Mara');
 chapter.passageTasks=[{id:'last',note:'Last motivation',completed:false,createdAt:chapter.updatedAt,anchor:anchorText(text,start,start+4)}];
 const matches=findStoryMatches(story,{...options,replacement:'Elizabeth',chapterId:chapter.id});const next=replaceStoryMatches(story,matches).chapters[0];
 assert.equal(matches.length,1000);assert.equal((next.html.match(/<b>Elizabeth<\/b>/g)||[]).length,1000);assert.equal(next.passageTasks[0].anchor.quote,'Elizabeth');assert.equal(next.passageTasks[0].anchor.start,start+999*5);
});

// Feature: replacement line breaks use their visible-text length when preserving passage links.
test('replacement CRLF breaks retain correctly sized passage anchors', () => {
 const {story,chapter}=fixture();const text=manuscriptText(chapter.html);const start=text.lastIndexOf('Mara');chapter.passageTasks=[{id:'line',note:'Line',completed:false,createdAt:chapter.updatedAt,anchor:anchorText(text,start,start+4)}];
 const next=replaceStoryMatches(story,findStoryMatches(story,{...options,chapterId:chapter.id,replacement:'New\r\nName'})).chapters[0];assert.equal(next.passageTasks[0].anchor.quote,'New\nName');assert.equal(next.passageTasks[0].anchor.end-next.passageTasks[0].anchor.start,8);
});
