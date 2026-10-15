import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupWord, searchWord } from '../src/features/editor/lib/wordLookup.ts';

test('word validation prevents sending chapter excerpts or URLs to lookup providers', () => {
  assert.equal(lookupWord(' Quiet '), 'quiet');
  assert.equal(lookupWord('well-known'), 'well-known');
  for (const invalid of ['a chapter excerpt', 'https://secret.test', '', '海', 'a'.repeat(65)]) assert.throws(() => lookupWord(invalid), /one English word/);
});

test('lookup encodes only the word, handles independent provider failure, and caches successful results', async (context) => {
  const calls = [];
  context.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => url.includes('dictionaryapi') ? [{ phonetic: '/kalm/', meanings: [{ partOfSpeech: 'adjective', definitions: [{ definition: 'Free from disturbance.', example: 'The calm sea.' }], synonyms: ['quiet'] }] }] : [{ word: 'quiet' }, { word: 'peaceful' }] };
  });
  const found = await searchWord('calm');
  assert.equal(found.definitions[0].partOfSpeech, 'adjective');
  assert.deepEqual(found.synonyms, ['quiet', 'peaceful']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.includes('calm')));
  await searchWord('CALM');
  assert.equal(calls.length, 2);
});

test('a failed thesaurus still returns dictionary definitions, and failure is not cached', async (context) => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url) => {
    calls += 1;
    if (url.includes('datamuse')) throw new Error('Offline');
    return { ok: true, status: 200, json: async () => [{ meanings: [{ definitions: [{ definition: 'A test meaning.' }] }] }] };
  });
  const found = await searchWord('resilient');
  assert.equal(found.definitions.length, 1);
  assert.match(found.notices[0], /Thesaurus unavailable/);
  await searchWord('resilient');
  assert.equal(calls, 4);
});

test('missing dictionary words differ from unavailable services and requests can be canceled', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) => ({ ok: false, status: url.includes('dictionaryapi') ? 404 : 503 }));
  const found = await searchWord('unlistedword');
  assert.equal(found.definitions.length, 0);
  assert.deepEqual(found.notices, ['Thesaurus unavailable. Check your connection and try again.']);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(searchWord('cancelledword', controller.signal), /canceled/);
});

test('unreachable primary dictionary falls back to exact-word definitions with attribution', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('dictionaryapi')) throw new Error('Service unreachable');
    return { ok: true, status: 200, json: async () => url.includes('md=d') ? [{ word: 'silent', defs: ['adj\tFree from sound.', 'n\tA silent film.'] }, { word: 'wrongword', defs: ['n\tDo not use.'] }] : [{ word: 'quiet' }] };
  });
  const found = await searchWord('silent');
  assert.equal(found.definitions[0].partOfSpeech, 'adjective');
  assert.equal(found.definitions[0].definition, 'Free from sound.');
  assert.equal(found.definitions.length, 2);
  assert.match(found.notices[0], /supplied by Datamuse/);
  assert.deepEqual(found.synonyms, ['quiet']);
});

// Feature: normalize current Wiktionary data, preserve attribution, and allow explicit refresh/cancellation.
test('modern dictionary returns nested senses and attribution, and refresh bypasses cache', async (context) => {
 const calls=[];
 context.mock.method(globalThis,'fetch',async (url)=>{ calls.push(url); return {ok:true,status:200,json:async()=>url.includes('freedictionaryapi.com') ? { entries:[{partOfSpeech:'noun',pronunciations:[{text:'/test/'}],senses:[{definition:'A primary sense.',examples:['Example.'],synonyms:['trial'],subsenses:[{definition:'A nested sense.'}]}]}],source:{url:'https://en.wiktionary.org/wiki/checkpoint'}} : [{word:'milestone'}]}; });
 const found=await searchWord('checkpoint'); assert.equal(found.definitions.length,2); assert.equal(found.phonetic,'/test/'); assert.match(found.source.name,/FreeDictionaryAPI.com/); assert.equal(found.source.license,'CC BY-SA 4.0'); assert.deepEqual(found.synonyms,['trial','milestone']);
 assert.equal((await searchWord('checkpoint')).cached,true); assert.equal(calls.length,2);
 await searchWord('checkpoint',undefined,true); assert.equal(calls.length,4);
 const controller=new AbortController();controller.abort();await assert.rejects(searchWord('checkpoint',controller.signal),/canceled/);
});
test('a missing preferred entry tries the legacy dictionary while synonyms remain independent', async (context) => {
 const calls=[]; context.mock.method(globalThis,'fetch',async (url)=>{calls.push(url);return {ok:!url.includes('freedictionaryapi.com'),status:url.includes('freedictionaryapi.com')?404:200,json:async()=>url.includes('api.dictionaryapi.dev')?[{meanings:[{definitions:[{definition:'Legacy meaning.'}]}]}]:[{word:'tough'}]};});
 const result=await searchWord('steadfast'); assert.equal(result.definitions[0].definition,'Legacy meaning.');assert.equal(result.source.name,'Free Dictionary API');assert.deepEqual(result.synonyms,['tough']);assert.equal(calls.length,3);
});
test('canceling a running search aborts independent requests without caching incomplete results', async (context) => {
 let aborts=0;
 context.mock.method(globalThis,'fetch',async (url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborts++;reject(new Error('Aborted'));},{once:true})));
 const controller=new AbortController();const result=searchWord('cancellationfixture',controller.signal);controller.abort();await assert.rejects(result,/canceled/);assert.equal(aborts,2);
});

// Feature: a stalled preferred dictionary times out without canceling already available thesaurus results.
test('provider timeout falls through to legacy definitions without losing synonyms', async (context) => {
 let timedOut=false;
 context.mock.method(globalThis,'fetch',async (url,{signal})=>{
  if(url.includes('freedictionaryapi.com')) return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{timedOut=true;reject(new Error('Timeout'));},{once:true}));
  return {ok:true,status:200,json:async()=>url.includes('api.dictionaryapi.dev')?[{meanings:[{definitions:[{definition:'The alternate dictionary answered.'}]}]}]:[{word:'patient'}]};
 });
 const found=await searchWord('timeoutfixture');assert.equal(timedOut,true);assert.equal(found.definitions[0].definition,'The alternate dictionary answered.');assert.deepEqual(found.synonyms,['patient']);assert.match(found.notices[0],/alternate dictionary/);
});
