import Pressable from '../../../components/AccessiblePressable';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { DEFAULT_PROSE, type ProsePreferences, type StyleGuide, type WritingPreferences } from '../../../domain/model';
import { analyzeProse, proofread } from '../lib/proofreading';
import type { TextEdit } from '../lib/manuscriptOperations';
import { searchWord, type WordLookup } from '../lib/wordLookup';
import type { Theme } from '../../../theme/theme';

type Props = { visible: boolean; theme: Theme; text: string; selectedWord: string; preferences: WritingPreferences; styleGuide?: StyleGuide; prosePreferences?: ProsePreferences; ignoredProofreading: string[]; onPreferences: (next: WritingPreferences) => void; onProsePreferences: (next: ProsePreferences) => void; onIgnore: (ids: string[]) => void; onApply: (edit: TextEdit) => void; onLocate: (start: number, end: number) => void; onClose: () => void };

// Feature: local proofreading and configurable fiction signals share an optional panel with resilient word lookups.
export default function WritingTools({ visible, theme, text, selectedWord, preferences, styleGuide, prosePreferences = DEFAULT_PROSE, ignoredProofreading, onPreferences, onProsePreferences, onIgnore, onApply, onLocate, onClose }: Props) {
  const styles = makeStyles(theme);
  const [tab, setTab] = useState<'grammar' | 'prose' | 'words'>('grammar');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<WordLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const suggestions = useMemo(() => preferences.grammarSuggestions ? proofread(text, styleGuide).filter((item) => !ignoredProofreading.includes(item.id) && !ignoredProofreading.includes('rule:' + item.rule)) : [], [text, preferences.grammarSuggestions, styleGuide, ignoredProofreading]);

  const prose = useMemo(() => analyzeProse(text, prosePreferences), [text, prosePreferences]);
  const [analysisError, setAnalysisError] = useState('');
  // Applies a reviewed correction and reports a stale passage without discarding the draft.
  const apply = (edit: TextEdit) => { try { onApply(edit); setAnalysisError(''); } catch (failure) { setAnalysisError(failure instanceof Error ? failure.message : 'Could not apply this correction.'); } };
  // Highlights the actual passage after closing the assistance modal.
  const locate = (start: number, end: number) => { onClose(); onLocate(start, end); };

  // Closing the tool cancels pending requests so stale results cannot replace a later search.
  useEffect(() => {
    if (!visible) { requestRef.current?.abort(); setBusy(false); }
    return () => requestRef.current?.abort();
  }, [visible]);

  // Runs both word services and shows partial results when one provider is unavailable.
  const search = async (refresh = false) => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setBusy(true); setError(''); setResult(null);
    try {
      const found = await searchWord(query, request.signal, refresh);
      if (!request.signal.aborted) setResult(found);
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Search failed. Try again.');
    } finally { if (requestRef.current === request) setBusy(false); }
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss writing tools" onPress={onClose} style={styles.dismiss} />
      <View accessibilityViewIsModal style={styles.modal}>
        <View style={styles.header}><Text style={styles.heading}>Writing tools</Text><Pressable accessibilityRole="button" accessibilityLabel="Close writing tools" onPress={onClose}><Text style={styles.close}>×</Text></Pressable></View>
        <View style={styles.tabs}>{(['grammar', 'prose', 'words'] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.activeTab]}><Text style={styles.tabText}>{value === 'grammar' ? 'Proofreading' : value === 'prose' ? 'Prose analysis' : 'Dictionary & thesaurus'}</Text></Pressable>)}</View>
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {tab === 'grammar' ? <>
            <View style={styles.toggleRow}><View style={styles.toggleCopy}><Text style={styles.title}>Grammar suggestions</Text><Text style={styles.detail}>Review duplicate words, punctuation spacing, capitalization, quotation style and common grammar patterns locally.</Text></View><Switch accessibilityLabel="Grammar suggestions" value={preferences.grammarSuggestions} onValueChange={(grammarSuggestions) => onPreferences({ ...preferences, grammarSuggestions })} trackColor={{ true: theme.accent, false: theme.border }} /></View>
            <View style={styles.toggleRow}><View style={styles.toggleCopy}><Text style={styles.title}>Auto-capitalize “I”</Text><Text style={styles.detail}>Correct a lowercase pronoun when you finish typing it with a space or punctuation. Existing text stays as written.</Text></View><Switch accessibilityLabel="Auto-capitalize I" value={preferences.autoCapitalizeI} onValueChange={(autoCapitalizeI) => onPreferences({ ...preferences, autoCapitalizeI })} trackColor={{ true: theme.accent, false: theme.border }} /></View>
            <Text style={styles.detail}>These English rules are suggestions, including simple verb agreement, articles and modal phrases. They do not understand plot or every grammatical construction. Review dialogue and dialect individually. System spellcheck adds spelling help; your draft stays local.</Text>
            {preferences.grammarSuggestions ? <>
              <Text style={styles.title}>{suggestions.length} {suggestions.length === 1 ? 'suggestion' : 'suggestions'}</Text>
              {!!analysisError && <Text accessibilityRole="alert" style={styles.detail}>{analysisError}</Text>}
              {suggestions.slice(0, 40).map((item) => <View key={item.id} style={styles.suggestion}><Text style={styles.title}>{item.title}</Text><Text style={styles.detail}>{item.context}</Text><Text style={styles.detail}>{item.explanation}</Text>{item.after !== item.before && <Text style={styles.title}>{item.before} → {item.after}</Text>}<View style={styles.tabs}>{item.after !== item.before && <Pressable accessibilityRole="button" accessibilityLabel={'Apply ' + item.title + ' at character ' + (item.start + 1)} onPress={() => apply(item)} style={styles.button}><Text style={styles.buttonText}>Apply</Text></Pressable>}<Pressable accessibilityRole="button" onPress={() => locate(item.start, item.end)} style={styles.button}><Text style={styles.buttonText}>Show passage</Text></Pressable><Pressable accessibilityRole="button" onPress={() => onIgnore([...ignoredProofreading, item.id])} style={styles.button}><Text style={styles.buttonText}>Ignore this</Text></Pressable><Pressable accessibilityRole="button" onPress={() => onIgnore([...ignoredProofreading, 'rule:' + item.rule])} style={styles.button}><Text style={styles.buttonText}>Ignore rule</Text></Pressable></View></View>)}
              {!suggestions.length && <Text style={styles.detail}>No suggestions from the enabled rules. This is not a guarantee that the draft is error-free.</Text>}
              {suggestions.length > 40 && <Text style={styles.detail}>Showing the first 40 suggestions. Apply these to reveal the next ones.</Text>}
            </> : <Text style={styles.detail}>Suggestions are off. Turn them on whenever you want a quick review.</Text>}
            {!!ignoredProofreading.length && <Pressable accessibilityRole="button" onPress={() => onIgnore([])} style={styles.button}><Text style={styles.buttonText}>Restore ignored checks ({ignoredProofreading.length})</Text></Pressable>}
          </> : tab === 'prose' ? <>
            <Text style={styles.detail}>Patterns to review, not a quality score. Names, motifs, dialogue and repeated rhythms can be intentional. Choose which signals matter for this story.</Text>
            {(['repetitions', 'openings', 'phrases', 'lengths'] as const).map((key) => <View key={key} style={styles.toggleRow}><Text style={[styles.title, { flex: 1 }]}>{({ repetitions: 'Nearby repetitions', openings: 'Repeated sentence openings', phrases: 'Overused phrases', lengths: 'Sentence-length patterns' })[key]}</Text><Switch accessibilityLabel={'Analyze ' + key} value={prosePreferences[key]} onValueChange={(value) => onProsePreferences({ ...prosePreferences, [key]: value })} /></View>)}
            <Text style={styles.title}>Nearby repetition window: {prosePreferences.windowWords} words</Text><View style={styles.tabs}>{[40, 80, 150].map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: prosePreferences.windowWords === value }} key={value} onPress={() => onProsePreferences({ ...prosePreferences, windowWords: value })} style={styles.button}><Text style={styles.buttonText}>{value} words</Text></Pressable>)}</View>
            <Text style={styles.title}>Long sentence threshold: {prosePreferences.longSentenceWords} words</Text><View style={styles.tabs}>{[25, 35, 50].map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: prosePreferences.longSentenceWords === value }} key={value} onPress={() => onProsePreferences({ ...prosePreferences, longSentenceWords: value })} style={styles.button}><Text style={styles.buttonText}>{value} words</Text></Pressable>)}</View>
            <Text style={styles.title}>Phrases to watch (one per line)</Text><TextInput accessibilityLabel="Prose phrases to watch" multiline value={prosePreferences.overusedPhrases.join('\n')} onChangeText={(value) => onProsePreferences({ ...prosePreferences, overusedPhrases: value.split('\n') })} style={styles.input} />
            <Text style={styles.title}>{prose.sentences.length} estimated sentences · average {prose.average} words</Text>
            {prosePreferences.lengths && <View style={styles.suggestion}>{[{ label: 'Short: 1–10 words', n: prose.sentences.filter((item) => item.words <= 10).length }, { label: 'Medium: 11–24 words', n: prose.sentences.filter((item) => item.words > 10 && item.words < 25).length }, { label: 'Long: 25+ words', n: prose.sentences.filter((item) => item.words >= 25).length }].map((item) => <View key={item.label}><Text style={styles.detail}>{item.label}: {item.n}</Text><View style={{ height: 6, borderRadius: 3, backgroundColor: theme.accentSoft }}><View style={{ height: 6, borderRadius: 3, backgroundColor: theme.accent, width: `${100 * item.n / Math.max(1, prose.sentences.length)}%` }} /></View></View>)}<Text style={styles.detail}>Sentence estimates use punctuation; abbreviations and dialogue can affect the counts.</Text></View>}
            <Text style={styles.title}>{prose.signals.length} signals</Text>{prose.signals.slice(0, 50).map((item, index) => <View key={item.kind + item.start + index} style={styles.suggestion}><Text style={styles.title}>{item.title}</Text><Text style={styles.detail}>{item.context}</Text><Text style={styles.detail}>{item.detail}</Text><Pressable accessibilityRole="button" onPress={() => locate(item.start, item.end)} style={styles.button}><Text style={styles.buttonText}>Highlight passage</Text></Pressable></View>)}
            {!prose.signals.length && <Text style={styles.detail}>No patterns found with these settings.</Text>}{prose.signals.length > 50 && <Text style={styles.detail}>Showing the first 50 signals. Narrow the enabled signals to focus your review.</Text>}
          </> : <>
            <Text style={styles.detail}>Look up one English word. Only the word you search is sent to the dictionary and thesaurus services. Internet access is needed for new searches.</Text>
            {!!selectedWord && <Pressable accessibilityRole="button" onPress={() => setQuery(selectedWord)} style={styles.button}><Text style={styles.buttonText}>Use selected word: {selectedWord}</Text></Pressable>}
            <View style={styles.searchRow}><TextInput accessibilityLabel="Dictionary word" value={query} onChangeText={setQuery} onSubmitEditing={() => { void search(); }} placeholder="Search a word…" placeholderTextColor={theme.muted} autoCapitalize="none" style={styles.input} /><Pressable accessibilityRole="button" disabled={busy || !query.trim()} onPress={() => { void search(); }} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Searching…' : 'Search'}</Text></Pressable></View>
            {busy && <ActivityIndicator color={theme.accent} />}
            {!!error && <Text accessibilityRole="alert" style={styles.detail}>{error}</Text>}
            {result && <>
              <Text style={styles.heading}>{result.word} <Text style={styles.detail}>{result.phonetic}</Text></Text>
              {result.notices.map((notice) => <Text key={notice} accessibilityRole="alert" style={styles.detail}>{notice}</Text>)}
              <Text style={styles.title}>Dictionary{result.cached ? ' · cached for this session' : ''}</Text>
              {result.source && <View style={styles.sources}><Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(result.source!.url); }} style={styles.button}><Text style={styles.buttonText}>{result.source.name}</Text></Pressable>{!!result.source.license && <Text style={styles.detail}>{result.source.license}</Text>}</View>}
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void search(true); }} style={styles.button}><Text style={styles.buttonText}>Refresh lookup</Text></Pressable>
              {result.definitions.map((definition, index) => <View key={index} style={styles.suggestion}><Text style={styles.part}>{definition.partOfSpeech}</Text><Text selectable style={styles.definition}>{definition.definition}</Text>{!!definition.example && <Text selectable style={styles.detail}>{definition.example}</Text>}</View>)}
              {!result.definitions.length && <Text style={styles.detail}>{result.notices.some((item) => item.startsWith('Dictionary')) ? 'Definitions could not be loaded.' : 'No definition found. Try another form or spelling.'}</Text>}
              <Text style={styles.title}>Thesaurus</Text><Text style={styles.detail}>Synonyms may fit different meanings. Check the definition before choosing.</Text>
              <View style={styles.words}>{result.synonyms.map((word) => <Pressable key={word} accessibilityRole="button" accessibilityLabel={'Look up ' + word} onPress={() => setQuery(word)} style={styles.word}><Text selectable style={styles.wordText}>{word}</Text></Pressable>)}</View>
              {!result.synonyms.length && <Text style={styles.detail}>{result.notices.some((item) => item.startsWith('Thesaurus')) ? 'Synonyms could not be loaded.' : 'No synonyms found for this word.'}</Text>}
            </>}
            <View style={styles.sources}><Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://freedictionaryapi.com/'); }}><Text style={styles.buttonText}>FreeDictionaryAPI.com</Text></Pressable><Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://www.datamuse.com/api/'); }}><Text style={styles.buttonText}>Datamuse</Text></Pressable></View>
          </>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

// Uses the existing pastel tokens and a bounded, scrollable modal on desktop and narrow screens.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(18,16,21,0.34)' },
    dismiss: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    modal: { width: '100%', maxWidth: 580, maxHeight: '88%', padding: 22, borderRadius: 18, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, gap: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    heading: { color: theme.text, fontSize: 20, fontWeight: '700' }, close: { minWidth: 44, minHeight: 44, textAlign: 'center', color: theme.muted, fontSize: 26 },
    tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, tab: { padding: 10, borderBottomWidth: 2, borderColor: theme.border }, activeTab: { borderColor: theme.accent, backgroundColor: theme.accentSoft }, tabText: { color: theme.text, fontSize: 14 },
    scroll: { flexShrink: 1 }, content: { gap: 15, paddingBottom: 10 },
    toggleRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8 }, toggleCopy: { flex: 1, gap: 5 },
    title: { color: theme.text, fontSize: 14, fontWeight: '600' }, detail: { color: theme.muted, fontSize: 13, lineHeight: 19 },
    suggestion: { paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border, gap: 8 },
    button: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, alignSelf: 'flex-start' }, buttonText: { color: theme.accent, fontSize: 14, fontWeight: '600' },
    searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, input: { flex: 1, minWidth: 0, padding: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 8, color: theme.text, fontSize: 14 },
    part: { color: theme.secondary, fontSize: 14 }, definition: { color: theme.text, fontSize: 14, lineHeight: 21 },
    words: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, word: { minHeight: 44, justifyContent: 'center', backgroundColor: theme.accentSoft, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8 }, wordText: { color: theme.text, fontSize: 14 }, sources: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', paddingTop: 10 },
  });
}
