import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import { countWords, createId, createScene, DEFAULT_STYLE, type Chapter, type ChapterScene, type Story, type StyleGuide, type StyleRule, type TextAnchor, type Workspace } from '../../../domain/model';
import { anchorText, findStoryMatches, resolveAnchor, sceneTimeline, type SearchMatch, type SearchOptions } from '../lib/manuscriptOperations';
import { manuscriptText } from '../lib/writingAnalysis';
import { proofread } from '../lib/proofreading';
import ChapterComparison from './ChapterComparison';
import type { ChapterRecoveryRequest } from '../lib/chapterRecovery';
import { listWorkspaceVersions } from '../../workspace/lib/storage';
import type { SavedVersion } from '../../workspace/lib/saveHistory';
import type { Theme } from '../../../theme/theme';

export type RevisionTab = 'find' | 'comments' | 'revisions' | 'style' | 'outline' | 'targets';
type Props = {
  visible: boolean; initialTab: RevisionTab; openToken: number; theme: Theme; workspace: Workspace; story: Story; chapter?: Chapter; selection?: TextAnchor;
  onClose: () => void; onLocate: (chapterId: string, start: number, end: number) => void;
  onPatchChapter: (id: string, patch: Partial<Chapter>) => void; onPatchStory: (patch: Partial<Story>) => void;
  onReplace: (matches: SearchMatch[]) => Promise<number>; onCheckpoint: (name: string) => Promise<unknown>; onRecover: (request: ChapterRecoveryRequest) => Promise<void>;
};
type PanelProps = Props & { styles: ReturnType<typeof makeStyles>; busy: boolean; run: (action: () => Promise<string>) => Promise<void> };
const TABS: { id: RevisionTab; title: string }[] = [{ id: 'find', title: 'Find & replace' }, { id: 'comments', title: 'Passage tasks' }, { id: 'revisions', title: 'Chapter revisions' }, { id: 'style', title: 'Project style guide' }, { id: 'outline', title: 'Scene outline' }, { id: 'targets', title: 'Targets & release buffer' }];

// Feature: an optional revision workspace keeps all editorial tools reachable without crowding the manuscript.
export default function RevisionTools(props: Props) {
  const styles = makeStyles(props.theme);
  const [tab, setTab] = useState<RevisionTab>(props.initialTab);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  // Search state lives outside the modal content so jumping to a result preserves the query and result navigation.
  const [search, setSearch] = useState<SearchOptions>({ query: '', replacement: '', wholeWord: false, matchCase: false, scope: 'chapter', chapterId: props.chapter?.id ?? '' });
  const [resultIndex, setResultIndex] = useState(0);
  useEffect(() => { setTab(props.initialTab); setError(''); setNotice(''); }, [props.openToken]);
  useEffect(() => { setSearch((value) => ({ ...value, chapterId: props.chapter?.id ?? '' })); }, [props.chapter?.id]);
  // Reports success only after an awaited checkpoint, replacement or recovery finishes.
  const run = async (action: () => Promise<string>) => {
    setBusy(true); setError(''); setNotice('');
    try { setNotice(await action()); } catch (failure) { setError(failure instanceof Error ? failure.message : 'The action could not be completed.'); }
    finally { setBusy(false); }
  };
  const shared: PanelProps = { ...props, styles, busy, run };
  return <Modal accessibilityLabel="Revision tools" visible={props.visible} transparent animationType="none" onRequestClose={() => { if (!busy) props.onClose(); }}>
    <View style={styles.overlay}><View style={styles.modal}>
      <View style={styles.header}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={styles.heading}>Revision tools</Text><Text style={styles.detail}>{props.story.title}{props.chapter ? ` / ${props.chapter.title}` : ''}</Text></View><Button title="Close" disabled={busy} onPress={props.onClose} styles={styles} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tabScroll} contentContainerStyle={styles.tabs}>{TABS.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} onPress={() => { setTab(item.id); setError(''); setNotice(''); }} style={[styles.button, tab === item.id && styles.selected]}><Text style={styles.buttonText}>{item.title}</Text></Pressable>)}</ScrollView>
      {busy && <ActivityIndicator color={props.theme.accent} />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.detail}>{notice}</Text>}
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {tab === 'find' && <FindPanel {...shared} search={search} setSearch={setSearch} resultIndex={resultIndex} setResultIndex={setResultIndex} />}
        {tab === 'comments' && <TasksPanel {...shared} />}
        {tab === 'revisions' && <RevisionsPanel {...shared} />}
        {tab === 'style' && <StylePanel {...shared} />}
        {tab === 'outline' && <OutlinePanel {...shared} />}
        {tab === 'targets' && <TargetsPanel {...shared} />}
      </ScrollView>
    </View></View>
  </Modal>;
}

// Feature: scoped literal search shows every occurrence through result navigation and reviews changes before applying.
function FindPanel(props: PanelProps & { search: SearchOptions; setSearch: (value: SearchOptions) => void; resultIndex: number; setResultIndex: (index: number) => void }) {
  const { styles, search, setSearch, busy } = props;
  const matches = useMemo(() => findStoryMatches(props.story, search), [props.story, search]);
  const index = matches.length ? Math.min(props.resultIndex, matches.length - 1) : 0;
  const selected = matches[index];
  // Changing search criteria resets navigation while keeping the original selection scope until explicitly refreshed.
  const patch = (value: Partial<SearchOptions>) => { setSearch({ ...search, ...value }); props.setResultIndex(0); };
  const show = (match: SearchMatch) => { props.onClose(); props.onLocate(match.chapterId, match.start, match.end); };
  return <View style={styles.content}>
    <Text style={styles.detail}>Search visible manuscript text. Matches inside formatting tags or links are excluded. Replacements keep surrounding formatting; inserted text uses the first matched text style.</Text>
    <View style={styles.row}>{(['selection', 'chapter', 'story'] as const).map((scope) => <Choice key={scope} title={scope === 'selection' ? 'Selection' : scope === 'chapter' ? 'This chapter' : 'Entire story'} selected={search.scope === scope} onPress={() => patch({ scope, ...(scope === 'selection' ? { selection: props.selection } : {}) })} styles={styles} />)}</View>
    {search.scope === 'selection' && <><Text style={styles.detail}>{search.selection?.quote ? `Selection: “${search.selection.quote.slice(0, 140)}”` : 'Select text in the manuscript, then open Revision tools to search that selection.'}</Text><Button title="Use current selection" disabled={!props.selection?.quote} onPress={() => patch({ selection: props.selection })} styles={styles} /></>}
    <Field label="Find text" value={search.query} onChangeText={(query) => patch({ query })} styles={styles} />
    <Field label="Replace with" value={search.replacement} onChangeText={(replacement) => patch({ replacement })} styles={styles} />
    <View style={styles.row}><Choice checkbox title="Whole word" selected={search.wholeWord} onPress={() => patch({ wholeWord: !search.wholeWord })} styles={styles} /><Choice checkbox title="Match case" selected={search.matchCase} onPress={() => patch({ matchCase: !search.matchCase })} styles={styles} /></View>
    <Text style={styles.title}>{matches.length} results{selected ? ` · ${index + 1} of ${matches.length}` : ''}</Text>
    <View style={styles.row}><Button title="Previous result" disabled={!matches.length} onPress={() => props.setResultIndex((index - 1 + matches.length) % matches.length)} styles={styles} /><Button title="Next result" disabled={!matches.length} onPress={() => props.setResultIndex((index + 1) % matches.length)} styles={styles} /></View>
    {selected && <View style={styles.card}><Text style={styles.title}>{selected.chapterTitle}</Text><Text selectable style={styles.quote}>{selected.context}</Text><Text style={styles.detail}>Replacement preview</Text><Text style={styles.quote}>{selected.before} → {selected.after || '(remove matched text)'}</Text><View style={styles.row}><Button title="Show in manuscript" onPress={() => show(selected)} styles={styles} /><Button title="Replace this result" disabled={busy || selected.before === selected.after} onPress={() => { void props.run(async () => `${await props.onReplace([selected])} replacement saved. The earlier draft is in chapter revisions.`); }} styles={styles} /></View></View>}
    <Text style={styles.detail}>Replace all creates a checkpoint before changing the draft. A changed draft invalidates its preview. Review the results before applying.</Text>
    <Button title={`Replace all ${matches.length} results`} disabled={busy || !matches.some((match) => match.before !== match.after)} onPress={() => { void props.run(async () => `${await props.onReplace(matches)} replacements saved. The earlier draft is in chapter revisions.`); }} styles={styles} />
    {matches.slice(Math.floor(index / 50) * 50, Math.floor(index / 50) * 50 + 50).map((match, offset) => <Pressable key={match.chapterId + match.start} accessibilityState={{ selected: match === selected }} onPress={() => props.setResultIndex(Math.floor(index / 50) * 50 + offset)} style={[styles.card, match === selected && styles.selected]}><Text style={styles.title}>{match.chapterTitle}</Text><Text style={styles.detail}>{match.context}</Text><Text style={styles.detail}>{match.before} → {match.after || '(remove)'}</Text></Pressable>)}
    {matches.length > 50 && <Text style={styles.detail}>Showing this group of 50 results. Previous/Next reaches all {matches.length} occurrences.</Text>}
  </View>;
}

// Feature: passage notes are editable tasks with unresolved filtering, completion and explicit reattachment.
function TasksPanel(props: PanelProps) {
  const { styles, chapter, story, selection } = props;
  const [note, setNote] = useState(''); const [unresolved, setUnresolved] = useState(true); const [scope, setScope] = useState<'chapter' | 'story'>('chapter');
  const rows = story.chapters.filter((item) => scope === 'story' || item.id === chapter?.id).flatMap((item) => (item.passageTasks ?? []).filter((task) => !unresolved || !task.completed).map((task) => ({ chapter: item, task })));
  // Adds only a currently resolvable selected passage; stale selections cannot silently attach a comment elsewhere.
  const add = () => {
    if (!chapter || !selection?.quote || !note.trim()) return;
    const anchor = resolveAnchor(manuscriptText(chapter.html), selection);
    if (anchor.detached) return;
    props.onPatchChapter(chapter.id, { passageTasks: [...(chapter.passageTasks ?? []), { id: createId(), note: note.trim(), anchor, completed: false, createdAt: new Date().toISOString() }] }); setNote('');
  };
  return <View style={styles.content}>
    <Text style={styles.detail}>Select a passage in the manuscript before opening these tools. Notes follow edits; deleted passages stay listed for review and reattachment.</Text>
    <Text style={styles.quote}>{selection?.quote ? `Selected: “${selection.quote.slice(0, 180)}”` : 'No passage selected.'}</Text>
    <Field label="New passage comment or revision task" value={note} onChangeText={setNote} multiline styles={styles} />
    <Button title="Attach passage task" disabled={!chapter || !selection?.quote || !note.trim() || resolveAnchor(manuscriptText(chapter?.html ?? ''), selection ?? anchorText('', 0, 0)).detached} onPress={add} styles={styles} />
    <View style={styles.row}><Choice title="This chapter" selected={scope === 'chapter'} onPress={() => setScope('chapter')} styles={styles} /><Choice title="Entire story" selected={scope === 'story'} onPress={() => setScope('story')} styles={styles} /><Choice checkbox title="Unresolved only" selected={unresolved} onPress={() => setUnresolved(!unresolved)} styles={styles} /></View>
    <Text style={styles.title}>{rows.length} {unresolved ? 'unresolved' : 'total'} tasks</Text>
    {rows.map(({ chapter: item, task }, index) => {
      const anchor = resolveAnchor(manuscriptText(item.html), task.anchor);
      // Keeps unrelated tasks intact when editing one note or its completion state.
      const patchTask = (patch: Partial<typeof task>) => props.onPatchChapter(item.id, { passageTasks: item.passageTasks?.map((value) => value.id === task.id ? { ...value, ...patch } : value) });
      return <View key={task.id} style={styles.card}><Text style={styles.title}>{item.title}</Text><Text selectable style={styles.quote}>“{task.anchor.quote}”</Text><Field label={`Task ${index + 1} note`} value={task.note} multiline onChangeText={(value) => patchTask({ note: value })} styles={styles} /><Text style={styles.detail}>{anchor.detached ? 'Passage removed or ambiguous. Reattach explicitly to a new selection.' : task.completed ? 'Completed' : 'Unresolved'}</Text><View style={styles.row}><Button title={task.completed ? 'Reopen task' : 'Mark completed'} onPress={() => patchTask({ completed: !task.completed })} styles={styles} /><Button title="Show passage" disabled={anchor.detached} onPress={() => { props.onClose(); props.onLocate(item.id, anchor.start, anchor.end); }} styles={styles} />{item.id === chapter?.id && !!selection?.quote && <Button title="Reattach to selection" onPress={() => { const next = resolveAnchor(manuscriptText(item.html), selection); if (!next.detached) patchTask({ anchor: next }); }} styles={styles} />}</View></View>;
    })}
  </View>;
}

// Feature: named checkpoints and saved/current passage comparison are directly available from the editor.
function RevisionsPanel(props: PanelProps) {
  const { styles, chapter } = props;
  const [name, setName] = useState('First draft'); const [versions, setVersions] = useState<SavedVersion[]>([]); const [selected, setSelected] = useState<SavedVersion | null>(null);
  useEffect(() => { void props.run(async () => { setVersions(await listWorkspaceVersions()); return ''; }); }, []);
  const source = selected?.workspace.stories.find((story) => story.id === props.story.id)?.chapters.find((item) => item.id === chapter?.id);
  return <View style={styles.content}>
    <Text style={styles.detail}>A checkpoint preserves the workspace. Comparison and passage recovery here affect only this chapter. Recovery makes another checkpoint first.</Text>
    <Field label="Checkpoint name" value={name} onChangeText={setName} styles={styles} />
    <View style={styles.row}>{['First draft', 'Dialogue revision', 'Before line edit'].map((value) => <Button key={value} title={value} onPress={() => setName(value)} styles={styles} />)}</View>
    <Button title="Create named checkpoint" disabled={props.busy || !chapter || !name.trim()} onPress={() => { void props.run(async () => { await props.onCheckpoint(name.trim().slice(0, 120)); setVersions(await listWorkspaceVersions()); return 'Named checkpoint saved.'; }); }} styles={styles} />
    {source && chapter ? <><Text style={styles.title}>{selected?.label}</Text><ChapterComparison source={source} storyId={props.story.id} storyTitle={props.story.title} workspace={props.workspace} theme={props.theme} busy={props.busy} onBack={() => setSelected(null)} onRecover={(request) => { void props.run(async () => { await props.onRecover(request); setSelected(null); setVersions(await listWorkspaceVersions()); return 'Passages recovered. The draft from before recovery is in history.'; }); }} /></> : <>
      <Text style={styles.title}>Versions containing {chapter?.title ?? 'this chapter'}</Text>
      {versions.filter((version) => version.workspace.stories.some((story) => story.id === props.story.id && story.chapters.some((item) => item.id === chapter?.id))).map((version) => <Pressable key={version.id} disabled={props.busy} onPress={() => setSelected(version)} style={styles.card}><Text style={styles.title}>{version.label}</Text><Text style={styles.detail}>{new Date(version.savedAt).toLocaleString()}</Text><Text style={styles.buttonText}>Compare this chapter</Text></Pressable>)}
      {!versions.some((version) => version.workspace.stories.some((story) => story.id === props.story.id && story.chapters.some((item) => item.id === chapter?.id))) && <Text style={styles.detail}>Create a checkpoint to preserve the current revision.</Text>}
    </>}
  </View>;
}

// Feature: structured spelling, alias and typography preferences drive the same review across all chapters.
function StylePanel(props: PanelProps) {
  const { styles } = props; const guide = props.story.styleGuide ?? DEFAULT_STYLE;
  const [kind, setKind] = useState<StyleRule['kind']>('spelling'); const [preferred, setPreferred] = useState(''); const [variants, setVariants] = useState(''); const [note, setNote] = useState(''); const [characterId, setCharacterId] = useState<string>(); const [editing, setEditing] = useState<string>();
  const violations = useMemo(() => props.story.chapters.flatMap((chapter) => proofread(manuscriptText(chapter.html), guide).filter((item) => item.rule.startsWith('style-') || ['quote-style', 'ellipsis-style', 'dash-style'].includes(item.rule)).map((item) => ({ chapter, item }))), [props.story, guide]);
  // Writes one rule without replacing the rest of the project guide.
  const patch = (value: Partial<StyleGuide>) => props.onPatchStory({ styleGuide: { ...guide, ...value } });
  const saveRule = () => {
    if (!preferred.trim()) return;
    const rule: StyleRule = { id: editing ?? createId(), kind, preferred: preferred.trim(), variants: [...new Set(variants.split(/[,\n]/).map((value) => value.trim()).filter(Boolean))], note: note.trim(), ...(kind === 'alias' && characterId ? { characterId } : {}) };
    patch({ rules: editing ? guide.rules.map((item) => item.id === editing ? rule : item) : [...guide.rules, rule] }); setPreferred(''); setVariants(''); setNote(''); setEditing(undefined); setCharacterId(undefined);
  };
  return <View style={styles.content}>
    <Text style={styles.detail}>Aliases and invented words are accepted forms with their recorded capitalization. Preferred-spelling variants suggest corrections. Nothing rewrites chapters automatically.</Text>
    <View style={styles.row}>{([{ id: 'alias', title: 'Character aliases' }, { id: 'vocabulary', title: 'Invented vocabulary' }, { id: 'spelling', title: 'Preferred spelling' }, { id: 'capitalization', title: 'Capitalization' }] as const).map((item) => <Choice key={item.id} title={item.title} selected={kind === item.id} onPress={() => setKind(item.id)} styles={styles} />)}</View>
    {kind === 'alias' && <View style={styles.row}>{props.story.characters.map((character) => <Choice key={character.id} title={character.title} selected={characterId === character.id} onPress={() => { setCharacterId(character.id); setPreferred(character.title); }} styles={styles} />)}</View>}
    <Field label={kind === 'alias' ? 'Character or canonical name' : 'Preferred form'} value={preferred} onChangeText={setPreferred} styles={styles} />
    <Field label={kind === 'alias' || kind === 'vocabulary' ? 'Accepted aliases or forms (comma separated)' : 'Spellings to replace (comma separated, optional for capitalization)'} value={variants} onChangeText={setVariants} styles={styles} />
    <Field label="Rule explanation (optional)" value={note} onChangeText={setNote} styles={styles} />
    <Button title={editing ? 'Save style rule' : 'Add style rule'} disabled={!preferred.trim() || (kind === 'spelling' && !variants.trim())} onPress={saveRule} styles={styles} />
    {guide.rules.map((rule) => <View key={rule.id} style={styles.card}><Text style={styles.title}>{rule.preferred} · {rule.kind}</Text><Text style={styles.detail}>{rule.variants.join(', ')}{rule.note ? '\n' + rule.note : ''}</Text><View style={styles.row}><Button title={`Edit ${rule.preferred}`} onPress={() => { setEditing(rule.id); setKind(rule.kind); setPreferred(rule.preferred); setVariants(rule.variants.join(', ')); setNote(rule.note); setCharacterId(rule.characterId); }} styles={styles} /><Button title={`Remove ${rule.preferred}`} onPress={() => patch({ rules: guide.rules.filter((item) => item.id !== rule.id) })} styles={styles} /></View></View>)}
    <Text style={styles.title}>Punctuation conventions</Text>
    <Text style={styles.detail}>Double quotation marks</Text><View style={styles.row}>{(['any', 'curly', 'straight'] as const).map((value) => <Choice key={value} title={value} selected={guide.quoteStyle === value} onPress={() => patch({ quoteStyle: value })} styles={styles} />)}</View>
    <Text style={styles.detail}>Dashes</Text><View style={styles.row}>{(['any', 'em', 'spaced-en'] as const).map((value) => <Choice key={value} title={value === 'em' ? 'Em dash —' : value === 'spaced-en' ? 'Spaced en dash –' : 'Any'} selected={guide.dashStyle === value} onPress={() => patch({ dashStyle: value })} styles={styles} />)}</View>
    <Text style={styles.detail}>Ellipses</Text><View style={styles.row}>{(['any', 'character', 'dots'] as const).map((value) => <Choice key={value} title={value === 'character' ? 'Single character …' : value === 'dots' ? 'Three dots ...' : 'Any'} selected={guide.ellipsisStyle === value} onPress={() => patch({ ellipsisStyle: value })} styles={styles} />)}</View>
    <Field label="Style guide reference notes" value={guide.conventions} multiline onChangeText={(conventions) => patch({ conventions })} styles={styles} />
    <Text style={styles.detail}>Reference notes are for your review; the structured rules above power automatic checks.</Text>
    <Text style={styles.title}>{violations.length} project-style suggestions across the story</Text>
    {violations.slice(0, 80).map(({ chapter, item }) => <View key={chapter.id + item.id} style={styles.card}><Text style={styles.title}>{chapter.title} · {item.title}</Text><Text style={styles.quote}>{item.before} → {item.after}</Text><Text style={styles.detail}>{item.explanation}</Text><View style={styles.row}><Button title="Show in manuscript" onPress={() => { props.onClose(); props.onLocate(chapter.id, item.start, item.end); }} styles={styles} /><Button title="Apply style choice" disabled={props.busy} onPress={() => { void props.run(async () => `${await props.onReplace([{ ...item, chapterId: chapter.id, chapterTitle: chapter.title, expectedHtml: chapter.html }])} style correction saved after a checkpoint.`); }} styles={styles} /></View></View>)}
    {violations.length > 80 && <Text style={styles.detail}>Showing 80 suggestions. Review these to reveal the remaining choices.</Text>}
  </View>;
}

// Feature: real passage links define scene boundaries, word counts and quick manuscript navigation.
function OutlinePanel(props: PanelProps) {
  const { styles, chapter } = props; if (!chapter) return <Text style={styles.detail}>Create a chapter to outline its scenes.</Text>;
  const ranges = sceneTimeline(chapter).ordered;
  // Updating one outline record retains every other scene, cast assignment and reference.
  const patchScene = (id: string, patch: Partial<ChapterScene>) => props.onPatchChapter(chapter.id, { scenes: chapter.scenes?.map((scene) => scene.id === id ? { ...scene, ...patch } : scene) });
  return <View style={styles.content}>
    <Text style={styles.detail}>Select the beginning passage of a scene in the manuscript, then link it here. A linked scene runs from that selection’s start to the next linked scene, in manuscript order.</Text>
    <Text style={styles.quote}>{props.selection?.quote ? `Selection: “${props.selection.quote.slice(0, 160)}”` : 'No passage selected. Show a scene, select its beginning and reopen the outline.'}</Text>
    <Button title="Add outline scene" onPress={() => props.onPatchChapter(chapter.id, { scenes: [...(chapter.scenes ?? []), createScene(`Scene ${(chapter.scenes?.length ?? 0) + 1}`)] })} styles={styles} />
    {ranges.map(({ scene, start, end, words }, index) => <View key={scene.id} style={styles.card}>
      <Field label={`Scene ${index + 1} title`} value={scene.title} onChangeText={(title) => patchScene(scene.id, { title })} styles={styles} />
      <Text style={styles.detail}>{words === undefined ? scene.anchor ? 'Passage link needs review or reattachment.' : 'Not linked to a passage yet.' : `${words} words in the linked scene`}</Text>
      <View style={styles.row}><Button title="Link to selected passage" disabled={!props.selection?.quote || resolveAnchor(manuscriptText(chapter.html), props.selection ?? anchorText('', 0, 0)).detached} onPress={() => { if (props.selection) patchScene(scene.id, { anchor: resolveAnchor(manuscriptText(chapter.html), props.selection) }); }} styles={styles} /><Button title="Go to scene" disabled={start === undefined} onPress={() => { if (start !== undefined) { props.onPatchChapter(chapter.id, { activeSceneId: scene.id }); props.onClose(); props.onLocate(chapter.id, start, Math.min(end ?? start + 1, start + (scene.anchor?.quote.length ?? 1))); } }} styles={styles} /></View>
      <Field label={`${scene.title} viewpoint`} value={scene.viewpoint ?? ''} onChangeText={(viewpoint) => patchScene(scene.id, { viewpoint })} styles={styles} />
      <Text style={styles.detail}>Setting: {props.story.worldbuilding.find((item) => item.id === scene.settingId)?.title ?? (scene.settingId ? 'Deleted setting — choose another' : 'Not assigned')}</Text>
      <View style={styles.row}><Choice title="No setting" selected={!scene.settingId} onPress={() => patchScene(scene.id, { settingId: null })} styles={styles} />{props.story.worldbuilding.filter((item) => item.category === 'Setting').map((setting) => <Choice key={setting.id} title={setting.title} selected={scene.settingId === setting.id} onPress={() => patchScene(scene.id, { settingId: setting.id })} styles={styles} />)}</View>
      <Field label={`${scene.title} synopsis`} value={scene.synopsis ?? ''} multiline onChangeText={(synopsis) => patchScene(scene.id, { synopsis })} styles={styles} />
    </View>)}
  </View>;
}

// Feature: goals remain opt-in and release tracking records finished installments without publishing anything.
function TargetsPanel(props: PanelProps) {
  const { styles, story, chapter } = props;
  const total = story.chapters.reduce((sum, item) => sum + countWords(item.html), 0);
  const [sessionTarget, setSessionTarget] = useState(String(story.sessionGoal?.target ?? 500)); const [chapterTarget, setChapterTarget] = useState(String(chapter?.chapterGoal ?? ''));
  useEffect(() => setChapterTarget(String(chapter?.chapterGoal ?? '')), [chapter?.id]);
  const ready = story.chapters.filter((item) => item.releaseStatus === 'complete').sort((a, b) => (a.releaseDate ?? '9999').localeCompare(b.releaseDate ?? '9999'));
  // Reject invalid goals before they can reach persisted workspace validation.
  const validGoal = (value: string) => /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 1_000_000;
  return <View style={styles.content}>
    <Text style={styles.detail}>Targets are optional. Drafting shows a small chapter target only when enabled. Session progress counts net words added since you started the session.</Text>
    <Field label="Session word target" value={sessionTarget} onChangeText={setSessionTarget} numeric styles={styles} />
    <View style={styles.row}><Button title="Start new writing session" disabled={!validGoal(sessionTarget)} onPress={() => props.onPatchStory({ sessionGoal: { target: Number(sessionTarget), baseline: total, startedAt: new Date().toISOString() } })} styles={styles} />{story.sessionGoal && <Button title="End session target" onPress={() => props.onPatchStory({ sessionGoal: undefined })} styles={styles} />}</View>
    {story.sessionGoal && <Text style={styles.title}>{Math.max(0, total - story.sessionGoal.baseline)} / {story.sessionGoal.target} net words this session{total - story.sessionGoal.baseline >= story.sessionGoal.target ? ' · Target reached' : ''}</Text>}
    <Field label="Current chapter word target" value={chapterTarget} onChangeText={setChapterTarget} numeric styles={styles} />
    <View style={styles.row}><Button title="Set chapter target" disabled={!chapter || !validGoal(chapterTarget)} onPress={() => { if (chapter) props.onPatchChapter(chapter.id, { chapterGoal: Number(chapterTarget) }); }} styles={styles} /><Button title="Remove chapter target" disabled={!chapter?.chapterGoal} onPress={() => { if (chapter) { props.onPatchChapter(chapter.id, { chapterGoal: undefined }); setChapterTarget(''); } }} styles={styles} /></View>
    {chapter?.chapterGoal && <Text style={styles.detail}>{countWords(chapter.html)} / {chapter.chapterGoal} words in {chapter.title}</Text>}
    <Text style={styles.title}>Release buffer · {ready.length} completed installments awaiting release</Text>
    <Text style={styles.detail}>Dates and statuses are your local plan. Mark an installment released when you publish it yourself.</Text>
    {ready.map((item) => <View key={item.id} style={styles.card}><Text style={styles.title}>{item.title}</Text><Text style={styles.detail}>{countWords(item.html)} words · {item.releaseDate ?? 'No release date set'}</Text><Button title={`Mark ${item.title} released`} onPress={() => props.onPatchChapter(item.id, { releaseStatus: 'released' })} styles={styles} /></View>)}
    <Text style={styles.title}>Manage installments</Text>
    {story.chapters.map((item) => <ReleaseRow key={item.id} chapter={item} styles={styles} onPatch={(patch) => props.onPatchChapter(item.id, patch)} />)}
  </View>;
}

// Feature: draft date input separately so partial or impossible dates never corrupt a saved workspace.
function ReleaseRow({ chapter, styles, onPatch }: { chapter: Chapter; styles: ReturnType<typeof makeStyles>; onPatch: (patch: Partial<Chapter>) => void }) {
  const [date, setDate] = useState(chapter.releaseDate ?? ''); const [error, setError] = useState('');
  const saveDate = () => {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) { setError('Use a real calendar date in YYYY-MM-DD format.'); return; }
    setError(''); onPatch({ releaseDate: date || undefined });
  };
  return <View style={styles.card}><Text style={styles.title}>{chapter.title}</Text><View style={styles.row}>{(['draft', 'complete', 'released'] as const).map((value) => <Choice key={value} title={value === 'complete' ? 'Completed / ready' : value} selected={(chapter.releaseStatus ?? 'draft') === value} onPress={() => onPatch({ releaseStatus: value })} styles={styles} />)}</View><Field label={`${chapter.title} release date (YYYY-MM-DD)`} value={date} onChangeText={setDate} styles={styles} /><Button title="Save release date" onPress={saveDate} styles={styles} />{!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}</View>;
}

// Feature: shared controls use readable labels, native/web states and touch-sized targets across revision panels.
function Button({ title, onPress, disabled, styles }: { title: string; onPress: () => void; disabled?: boolean; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable accessibilityLabel={title} disabled={disabled} accessibilityState={{ disabled: !!disabled }} onPress={onPress} style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
// Feature: radio/checkbox choices expose their state as well as a visible selected surface.
function Choice({ title, selected, onPress, styles, checkbox = false }: { title: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles>; checkbox?: boolean }) {
  return <Pressable accessibilityRole={checkbox ? 'checkbox' : 'radio'} accessibilityLabel={title} accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.button, selected && styles.selected]}><Text style={styles.buttonText}>{checkbox ? selected ? '✓ ' : '□ ' : ''}{title}</Text></Pressable>;
}
// Feature: form fields carry accurate accessible names and preserve multiline notes on all platforms.
function Field({ label, value, onChangeText, styles, multiline = false, numeric = false }: { label: string; value: string; onChangeText: (value: string) => void; styles: ReturnType<typeof makeStyles>; multiline?: boolean; numeric?: boolean }) {
  return <View style={{ gap: 5 }}><Text style={styles.detail}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} multiline={multiline} keyboardType={numeric ? 'numeric' : 'default'} style={[styles.input, multiline && { minHeight: 80, textAlignVertical: 'top' }]} /></View>;
}
// Feature: bounded scrolling and flexible rows keep revision tools usable in narrow drafting windows.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    overlay: { flex: 1, padding: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(18,16,21,0.35)' },
    modal: { width: '100%', maxWidth: 920, maxHeight: '94%', padding: 18, gap: 12, borderRadius: 16, backgroundColor: theme.surface },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, heading: { fontSize: 22, color: theme.text, fontWeight: '700' },
    title: { fontSize: 15, fontWeight: '600', color: theme.text }, detail: { fontSize: 13, color: theme.muted, lineHeight: 20 }, error: { color: theme.text, backgroundColor: theme.secondarySoft, padding: 10, fontSize: 14, lineHeight: 21 },
    tabs: { alignItems: 'center', gap: 8, padding: 4 }, tabScroll: { height: 72, minHeight: 72, flexShrink: 0 }, content: { gap: 12, paddingBottom: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    button: { minHeight: 44, justifyContent: 'center', padding: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.border, borderRadius: 8 }, buttonText: { color: theme.accent, fontWeight: '600', fontSize: 14 }, selected: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
    input: { minHeight: 44, borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10, color: theme.text, fontSize: 14, backgroundColor: theme.background },
    card: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, gap: 10 }, quote: { fontSize: 15, lineHeight: 23, color: theme.text, padding: 10, backgroundColor: theme.background, borderRadius: 6 },
  });
}
