export type WordDefinition = { partOfSpeech: string; definition: string; example?: string };
export type WordLookup = { word: string; phonetic: string; definitions: WordDefinition[]; synonyms: string[]; notices: string[]; source?: { name: string; url: string; license?: string }; cached?: boolean };
const cache = new Map<string, { result: WordLookup; expires: number }>();

// Limits lookups to one English word; manuscript paragraphs can never be sent as an API query.
export function lookupWord(value: string): string {
  const word = value.trim().toLowerCase();
  if (!/^[a-z]+(?:['’-][a-z]+)*$/.test(word) || word.length > 64) throw new Error('Enter one English word, such as “quiet” or “return”.');
  return word;
}

// Feature: each provider gets its own timeout and cancellation so one slow service cannot abort another.
async function requestJson(url: string, signal?: AbortSignal, timeoutMs = 4_000): Promise<unknown> {
  const controller = new AbortController(); const cancel = () => controller.abort();
  if (signal?.aborted) throw new Error('Search canceled.');
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(response.status === 429 ? 'Service rate limit reached.' : `Service returned HTTP ${response.status}.`);
    return await response.json();
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
}

// Feature: normalize both dictionary schemas while retaining source attribution and pronunciation text.
function dictionaryResult(data: unknown, modern: boolean): Pick<WordLookup, 'definitions' | 'phonetic' | 'synonyms' | 'source'> {
  const result: Pick<WordLookup, 'definitions' | 'phonetic' | 'synonyms' | 'source'> = { definitions: [], phonetic: '', synonyms: [], source: { name: modern ? 'FreeDictionaryAPI.com' : 'Free Dictionary API', url: modern ? 'https://freedictionaryapi.com/' : 'https://dictionaryapi.dev/' } };
  if (Array.isArray(data)) {
    for (const entry of data) {
      result.phonetic ||= typeof entry?.phonetic === 'string' ? entry.phonetic : entry?.phonetics?.find((item: any) => typeof item?.text === 'string')?.text ?? '';
      for (const meaning of Array.isArray(entry?.meanings) ? entry.meanings : []) {
        for (const item of Array.isArray(meaning?.definitions) ? meaning.definitions : []) if (typeof item?.definition === 'string') result.definitions.push({ partOfSpeech: typeof meaning.partOfSpeech === 'string' ? meaning.partOfSpeech : '', definition: item.definition, example: typeof item.example === 'string' ? item.example : undefined });
        result.synonyms.push(...(Array.isArray(meaning?.synonyms) ? meaning.synonyms.filter((item: unknown) => typeof item === 'string') : []));
      }
    }
    return result;
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as any).entries)) throw new Error('Dictionary returned unreadable data.');
  const response = data as any;
  for (const entry of response.entries) {
    result.phonetic ||= entry?.pronunciations?.find((item: any) => typeof item?.text === 'string')?.text ?? '';
    // Walk nested Wiktionary senses so alternative meanings are not silently dropped.
    const visit = (senses: any[]) => {
      for (const sense of Array.isArray(senses) ? senses : []) {
        if (typeof sense?.definition === 'string') result.definitions.push({ partOfSpeech: typeof entry.partOfSpeech === 'string' ? entry.partOfSpeech : '', definition: sense.definition, example: Array.isArray(sense.examples) ? sense.examples.find((item: unknown) => typeof item === 'string') : undefined });
        result.synonyms.push(...(Array.isArray(sense?.synonyms) ? sense.synonyms.filter((item: unknown) => typeof item === 'string') : []));
        if (Array.isArray(sense?.subsenses)) visit(sense.subsenses);
      }
    };
    visit(entry?.senses);
  }
  const source = response.source?.url;
  if (typeof source === 'string' && /^https:\/\/en\.wiktionary\.org\//.test(source)) result.source = { name: 'FreeDictionaryAPI.com / Wiktionary', url: source, license: 'CC BY-SA 4.0' };
  return result;
}

// Feature: prefer the responsive CORS-enabled service, then the legacy API, then exact Datamuse definitions.
async function definitions(word: string, signal?: AbortSignal) {
  const failures: string[] = [];
  for (const [url, modern] of [[`https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(word)}`, true], [`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, false]] as const) {
    try { const found = dictionaryResult(await requestJson(url, signal, modern ? 4_000 : 2_500), modern); if (!found.definitions.length) continue; return { ...found, notices: failures.length ? ['The preferred dictionary could not respond; showing the alternate dictionary.'] : [] }; }
    catch (failure) { if (signal?.aborted) throw new Error('Search canceled.'); failures.push(failure instanceof Error ? failure.message : 'Provider unavailable.'); }
  }
  try {
    const data = await requestJson(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&qe=sp&md=d&max=1`, signal);
    if (!Array.isArray(data)) throw new Error('Unreadable fallback.');
    const entry = data.find((item) => typeof item?.word === 'string' && item.word.toLowerCase() === word);
    const parts: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };
    const found = (Array.isArray(entry?.defs) ? entry.defs : []).filter((item: unknown) => typeof item === 'string').map((item: string) => {
      const [part, ...definition] = item.split('\t');
      return { partOfSpeech: definition.length ? parts[part] ?? part : '', definition: definition.length ? definition.join('\t') : part };
    });
    return { definitions: found, phonetic: '', synonyms: [] as string[], source: { name: 'Datamuse', url: 'https://www.datamuse.com/api/' }, notices: found.length ? ['Definitions supplied by Datamuse while the dictionary services are unavailable.'] : failures.length ? ['Dictionary unavailable. Check your connection and try again.'] : [] };
  } catch { if (signal?.aborted) throw new Error('Search canceled.'); return { definitions: [] as WordDefinition[], phonetic: '', synonyms: [] as string[], source: undefined, notices: failures.length ? ['Dictionary unavailable. Check your connection and try again.'] : [] }; }
}

// Feature: explicit word lookups support useful-result caching and a forced retry; failures are not cached.
export async function searchWord(value: string, signal?: AbortSignal, refresh = false): Promise<WordLookup> {
  const word = lookupWord(value);
  if (signal?.aborted) throw new Error('Search canceled.');
  const saved = cache.get(word);
  if (!refresh && saved && saved.expires > Date.now()) return { ...saved.result, cached: true };
  const [dictionary, thesaurus] = await Promise.allSettled([
    definitions(word, signal), requestJson(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=24`, signal),
  ]);
  if (signal?.aborted) throw new Error('Search canceled.');
  const result: WordLookup = { word, phonetic: '', definitions: [], synonyms: [], notices: [] };
  if (dictionary.status === 'fulfilled') Object.assign(result, dictionary.value);
  else result.notices.push('Dictionary unavailable. Check your connection and try again.');
  if (thesaurus.status === 'fulfilled' && Array.isArray(thesaurus.value)) result.synonyms.push(...thesaurus.value.filter((item) => typeof item?.word === 'string').map((item) => item.word));
  else result.notices.push('Thesaurus unavailable. Check your connection and try again.');
  result.definitions = result.definitions.slice(0, 16);
  result.synonyms = [...new Set(result.synonyms)].filter((item) => item.toLowerCase() !== word).slice(0, 24);
  if ((!result.notices.length || result.definitions.length) && thesaurus.status === 'fulfilled' && Array.isArray(thesaurus.value)) {
    if (cache.size >= 80) cache.delete(cache.keys().next().value!);
    cache.set(word, { result, expires: Date.now() + 10 * 60_000 });
  }
  return result;
}
