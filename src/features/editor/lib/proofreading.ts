import { DEFAULT_PROSE, DEFAULT_STYLE, type ProsePreferences, type StyleGuide } from '../../../domain/model.ts';
import { grammarSuggestions } from './writingAnalysis.ts';
import type { TextEdit } from './manuscriptOperations.ts';

export type ReviewSuggestion = TextEdit & { id: string; rule: string; title: string; explanation: string; context: string };

// Feature: conservative English checks offer explanations and individually reviewable edits, never silent rewrites.
export function proofread(text: string, guide: StyleGuide = DEFAULT_STYLE): ReviewSuggestion[] {
  const suggestions: ReviewSuggestion[] = [];
  // Creates stable occurrence IDs for saved ignore choices and short contextual replacement previews.
  const add = (start: number, before: string, after: string, rule: string, title: string, explanation: string) => {
    if (before === after && suggestions.some((item) => item.rule === rule)) return;
    suggestions.push({ start, end: start + before.length, before, after, rule, title, explanation,
      id: `${rule}:${start}:${before}`, context: text.slice(Math.max(0, start - 35), start + before.length + 45).replace(/\n/g, ' ') });
  };
  for (const item of grammarSuggestions(text)) add(item.start, item.before, item.after, 'pronoun-i', 'Capitalize the English pronoun', 'The standalone English pronoun I and its contractions are capitalized.');
  for (const match of text.matchAll(/\b([\p{L}]+)([ \t]+)\1\b/giu)) add(match.index, match[0], match[1], 'duplicate-word', 'Repeated word', 'This word occurs twice in a row. Repetition can be intentional in dialogue; review before removing it.');
  for (const match of text.matchAll(/[ \t]+([,!?;:])/gu)) add(match.index, match[0], match[1], 'space-before-punctuation', 'Space before punctuation', 'English commas and terminal punctuation usually touch the preceding word.');
  for (const match of text.matchAll(/[,;:!?](?=[\p{L}])/gu)) add(match.index, match[0], match[0] + ' ', 'space-after-punctuation', 'Missing punctuation space', 'A space normally separates this punctuation from the next word. Check invented names and deliberate stylization.');
  for (const match of text.matchAll(/(^|[.!?][ \t]+|\n[ \t]*)(["“‘(]*)([a-z])/gm)) {
    const start = match.index + match[1].length + match[2].length;
    add(start, match[3], match[3].toUpperCase(), 'sentence-capital', 'Sentence opening capitalization', 'This appears to begin a sentence or paragraph. Fragments and stylized dialogue may intentionally start lowercase.');
  }
  for (const match of text.matchAll(/\b(could|would|should|might|must) of\b/gi)) add(match.index, match[0], match[1] + ' have', 'modal-have', 'Modal verb phrase', 'The usual phrase is “could have” (or its contraction), rather than “could of”.');
  for (const match of text.matchAll(/\b(we|they|you) is\b/gi)) add(match.index, match[0], match[1] + ' are', 'plural-agreement', 'Pronoun–verb agreement', 'In standard English, we, they and you take “are”. Dialect or a quoted phrase may be intentional.');
  for (const match of text.matchAll(/\b(he|she|it) are\b/gi)) add(match.index, match[0], match[1] + ' is', 'singular-agreement', 'Pronoun–verb agreement', 'In standard English, he, she and it take “is”. Review dialect and quoted dialogue individually.');
  for (const match of text.matchAll(/\b(a) (apple|orange|egg|idea|animal|umbrella|hour|honest)\b/gi)) add(match.index, match[0], (match[1] === 'A' ? 'An' : 'an') + ' ' + match[2], 'article-an', 'Indefinite article', '“An” normally precedes this word’s vowel sound. This rule deliberately checks a small set of clear cases.');

  // Applies structured style-guide preferences to every chapter using the same rule definitions.
  for (const rule of guide.rules) {
    const accepted = rule.kind === 'alias' || rule.kind === 'vocabulary' ? [rule.preferred, ...rule.variants] : rule.variants;
    for (const variant of accepted.filter(Boolean)) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const match of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu'))) {
        let preferred = rule.kind === 'alias' || rule.kind === 'vocabulary' ? variant : rule.preferred;
        if (rule.kind === 'spelling' && /^[A-Z]/.test(match[0]) && /^[a-z]/.test(preferred)) preferred = preferred[0].toUpperCase() + preferred.slice(1);
        if (match[0] !== preferred) add(match.index, match[0], preferred, `style-${rule.id}`, 'Project style: ' + rule.preferred, rule.note || 'Use the spelling or capitalization recorded in this story’s style guide.');
      }
    }
    if (rule.kind === 'capitalization' && !rule.variants.includes(rule.preferred)) {
      const escaped = rule.preferred.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const match of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu'))) if (match[0] !== rule.preferred) add(match.index, match[0], rule.preferred, `style-${rule.id}`, 'Project capitalization', rule.note || 'Use this exact capitalization throughout the story.');
    }
  }

  let doubleQuoteOpen = false;
  for (const match of text.matchAll(/["“”]/g)) {
    if (guide.quoteStyle === 'curly' && match[0] === '"') add(match.index, match[0], doubleQuoteOpen ? '”' : '“', 'quote-style', 'Project quotation style', 'Your style guide calls for curly double quotation marks. Review which mark opens or closes the speech.');
    if (guide.quoteStyle === 'straight' && match[0] !== '"') add(match.index, match[0], '"', 'quote-style', 'Project quotation style', 'Your style guide calls for straight double quotation marks.');
    doubleQuoteOpen = match[0] === '“' ? true : match[0] === '”' ? false : !doubleQuoteOpen;
  }
  if (guide.quoteStyle === 'any' && /"/.test(text) && /[“”]/.test(text)) add(text.search(/["“”]/), text.match(/["“”]/)![0], text.match(/["“”]/)![0], 'mixed-quotes', 'Mixed quotation styles', 'Straight and curly double quotes both appear. Choose a project quotation style, or ignore if intentional.');
  if (doubleQuoteOpen) {
    const at = Math.max(text.lastIndexOf('"'), text.lastIndexOf('“'));
    if (at >= 0) add(at, text[at], text[at], 'unpaired-quote', 'Review quotation pairing', 'A double quote may be unpaired. Multi-paragraph dialogue may intentionally repeat opening marks; review rather than automatically closing it.');
  }
  for (const match of text.matchAll(/\.\.\.|…/g)) if (guide.ellipsisStyle !== 'any') {
    const preferred = guide.ellipsisStyle === 'character' ? '…' : '...';
    if (match[0] !== preferred) add(match.index, match[0], preferred, 'ellipsis-style', 'Project ellipsis style', 'Use the ellipsis convention selected in the style guide.');
  }
  for (const match of text.matchAll(/—| – /g)) if (guide.dashStyle !== 'any') {
    const preferred = guide.dashStyle === 'em' ? '—' : ' – ';
    if (match[0] !== preferred) add(match.index, match[0], preferred, 'dash-style', 'Project dash style', 'Use the dash convention selected in the style guide.');
  }
  return suggestions.sort((a, b) => a.start - b.start).filter((item, index, rows) => !rows.slice(0, index).some((previous) => previous.start === item.start && previous.before === item.before && previous.after === item.after));
}

export type ProseSignal = { start: number; end: number; title: string; detail: string; context: string; kind: 'repetition' | 'opening' | 'phrase' | 'length' };

// Feature: configurable fiction signals describe repetition and rhythm without scoring an author's prose.
export function analyzeProse(text: string, preferences: ProsePreferences = DEFAULT_PROSE) {
  const signals: ProseSignal[] = [];
  const words = [...text.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)];
  const sentences = [...text.matchAll(/[^.!?\n]+(?:[.!?]+["”’']*|(?=\n|$))/gu)].filter((match) => match[0].trim()).map((match) => ({ start: match.index, end: match.index + match[0].length, text: match[0].trim(), words: match[0].match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0 }));
  // Adds an advisory signal with a real text range for manuscript highlighting/navigation.
  const add = (start: number, end: number, kind: ProseSignal['kind'], title: string, detail: string) => signals.push({ start, end, kind, title, detail, context: text.slice(Math.max(0, start - 28), end + 40).replace(/\n/g, ' ') });
  if (preferences.repetitions) {
    const stop = new Set('that this with from have were there their they them then when where what would could should about into been said says just very some like your over only also'.split(' '));
    const seen = new Map<string, number>();
    words.forEach((word, index) => {
      const key = word[0].toLowerCase(); const last = seen.get(key);
      if (key.length >= 4 && !stop.has(key) && last !== undefined && index - last <= preferences.windowWords) add(word.index, word.index + word[0].length, 'repetition', 'Nearby repetition: ' + word[0], `Repeated within ${index - last} words. Names and deliberate motifs may appropriately recur.`);
      seen.set(key, index);
    });
  }
  if (preferences.openings) {
    const seen = new Map<string, number>();
    sentences.forEach((sentence, index) => {
      const opening = sentence.text.match(/^["“‘']*([\p{L}]+\s+[\p{L}]+)/u)?.[1]; if (!opening) return;
      const last = seen.get(opening.toLowerCase());
      if (last !== undefined && index - last <= 5) {
        const start = sentence.start + text.slice(sentence.start, sentence.end).indexOf(opening);
        add(start, start + opening.length, 'opening', 'Repeated sentence opening', `“${opening}” also opens a nearby sentence. Review variety if the repeated rhythm is not intentional.`);
      }
      seen.set(opening.toLowerCase(), index);
    });
  }
  if (preferences.phrases) for (const phrase of preferences.overusedPhrases.map((value) => value.trim()).filter(Boolean)) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'giu');
    const matches = [...text.matchAll(pattern)];
    if (matches.length >= 2) for (const match of matches) add(match.index, match.index + match[0].length, 'phrase', 'Repeated phrase: ' + phrase, `${matches.length} uses in this chapter. Your configured phrase list determines these signals.`);
  }
  if (preferences.lengths) for (const sentence of sentences) if (sentence.words >= preferences.longSentenceWords) add(sentence.start, sentence.end, 'length', `${sentence.words}-word sentence`, 'Long sentences can suit the scene. Check clarity and contrast with surrounding sentence lengths.');
  return { signals: signals.sort((a, b) => a.start - b.start), sentences, average: sentences.length ? Math.round(words.length / sentences.length) : 0 };
}
