import assert from 'node:assert/strict';
import test from 'node:test';
import { proofread, analyzeProse } from '../src/features/editor/lib/proofreading.ts';
import { DEFAULT_STYLE, DEFAULT_PROSE } from '../src/domain/model.ts';

// Feature: review rules explain their edits and configurable prose signals never rewrite the manuscript.
test('proofreading flags duplicate words, punctuation, capitalizations and common grammar patterns', () => {
 const text = 'i could of gone. they is here ,now. She are watching a apple. the the door.';
 const items = proofread(text); const rules = items.map((item) => item.rule);
 for (const rule of ['pronoun-i','modal-have','plural-agreement','singular-agreement','article-an','space-before-punctuation','space-after-punctuation','duplicate-word','sentence-capital']) assert.ok(rules.includes(rule),rule);
 for (const item of items) { assert.equal(text.slice(item.start,item.end),item.before); assert.ok(item.explanation.length > 20); }
 assert.equal(items.find((item) => item.rule === 'duplicate-word').after,'the');
});
test('style preferences apply across literal forms while accepting aliases and invented vocabulary', () => {
 const guide = { ...DEFAULT_STYLE, quoteStyle:'curly',dashStyle:'em',ellipsisStyle:'character',rules:[{id:'colour',kind:'spelling',preferred:'colour',variants:['color'],note:'House spelling'}, {id:'guild',kind:'capitalization',preferred:'Moon Guild',variants:[],note:''}, {id:'alias',kind:'alias',preferred:'Mara',variants:['The Captain'],note:''},{id:'word',kind:'vocabulary',preferred:'aetherglass',variants:[],note:''}] };
 const items = proofread('Color color moon guild Mara The Captain aetherglass "Hello" – then...',guide);
 assert.deepEqual(items.filter((item) => item.rule === 'style-colour').map((item) => item.after),['Colour','colour']);
 assert.ok(items.some((item) => item.after === 'Moon Guild')); assert.ok(!items.some((item) => ['style-alias','style-word'].includes(item.rule)));
 assert.deepEqual(items.filter((item) => item.rule === 'quote-style').map((item) => item.after),['“','”']);
 assert.ok(items.some((item) => item.after === '—')); assert.ok(items.some((item) => item.after === '…'));
});
test('quotation consistency is advisory when convention is unspecified', () => {
 const items=proofread('"Hello,” she said. “Wait.');
 assert.ok(items.some((item) => item.rule==='mixed-quotes' && item.before===item.after));
 assert.ok(items.some((item) => item.rule==='unpaired-quote' && item.before===item.after));
});
test('prose flags nearby repetition, repeated openings, selected phrases and configurable lengths', () => {
 const text='Mara watched the lantern. Mara watched the lantern for a moment. She waited for a moment in a quiet room with a candle.';
 const analysis=analyzeProse(text,{...DEFAULT_PROSE,longSentenceWords:12});
 for (const kind of ['repetition','opening','phrase','length']) assert.ok(analysis.signals.some((item)=>item.kind===kind),kind);
 for (const item of analysis.signals) assert.ok(text.slice(item.start,item.end).length);
 assert.equal(analysis.sentences.length,3);
 assert.equal(analyzeProse(text,{...DEFAULT_PROSE,repetitions:false,openings:false,phrases:false,lengths:false}).signals.length,0);
 assert.ok(!analyzeProse('Lantern fades. Lantern returns.',{...DEFAULT_PROSE,windowWords:1}).signals.some((item)=>item.kind==='repetition'));
});

// Feature: unpunctuated paragraph fragments remain represented in sentence-rhythm estimates.
test('sentence estimates include fragments before paragraph boundaries', () => {
 const analysis=analyzeProse('Mara waits\nA new morning\nLast line.');assert.deepEqual(analysis.sentences.map((item)=>item.words),[2,3,2]);assert.equal(analysis.average,2);
});
