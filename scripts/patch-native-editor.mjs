import { readFile, writeFile } from 'node:fs/promises';

// Feature: disable images in both native HTML parsers before rendering or clipboard paste creates a loader.
const root = new URL('../node_modules/react-native-enriched-html/', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (version !== '1.1.1') throw new Error('Review the native editor image policy for this dependency version.');

const patches = [
  {
    path: 'android/src/main/java/com/swmansion/enriched/common/parser/EnrichedParser.java',
    from: [
      '    } else if (tag.equalsIgnoreCase("img")) {',
      '      // Image content means the current tag is not empty (e.g. <li><img .../></li>).',
      '      isEmptyTag = false;',
      '      startImg(mSpannableStringBuilder, attributes, mSpanFactory);',
    ].join('\n'),
    to: [
      '    } else if (tag.equalsIgnoreCase("img")) {',
      '      // Feature: manuscripts cannot load image resources from pasted or saved HTML.',
    ].join('\n'),
  },
  {
    path: 'ios/htmlParser/HtmlParser.mm',
    from: '      if ([currentTagName isEqualToString:@"br"]) {\n        lastTagWasBr = YES;',
    to: [
      '      if ([currentTagName caseInsensitiveCompare:@"img"] == NSOrderedSame) {',
      '        // Feature: ignore images before they create attachments or shift text ranges.',
      '      } else if ([currentTagName isEqualToString:@"br"]) {',
      '        lastTagWasBr = YES;',
    ].join('\n'),
  },
];

// Check both exact upstream locations before writing either file. Reinstalling can safely reapply the policy.
const updates = await Promise.all(patches.map(async ({ path, from, to }) => {
  const file = new URL(path, root);
  const source = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  if (source.includes(to)) return null;
  if (source.split(from).length !== 2) throw new Error(`Native editor image policy could not be applied to ${path}.`);
  return { file, source: source.replace(from, to) };
}));
for (const update of updates) {
  if (update) await writeFile(update.file, update.source);
}
console.log('Native editor image policy verified for Android and iOS.');
