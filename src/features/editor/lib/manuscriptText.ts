// Feature: shared pure text decoding keeps word totals and scene analysis independent of model/module cycles.
export function decodeText(value: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#')) {
      const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '�';
    }
    return entities[code.toLowerCase()] ?? entity;
  });
}

// Feature: manuscript text retains block boundaries and encoded Unicode without splitting formatted words.
export function manuscriptText(html: string): string {
  let text = '';
  let hidden = false;
  for (const token of html.matchAll(/<!--[\s\S]*?-->|<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+|</g)) {
    const value = token[0];
    if (value.startsWith('<!--')) continue;
    if (value.startsWith('<') && value.length > 1) {
      if (/^<(script|style)\b/i.test(value)) hidden = true;
      else if (/^<\/(script|style)\s*>/i.test(value)) { hidden = false; continue; }
      if (hidden) continue;
      if (/^<(?:p|div|h[1-6]|li|blockquote|ul|ol)\b/i.test(value) && text && !text.endsWith('\n')) text += '\n';
      else if (/^<br\b|^<\/(?:p|div|h[1-6]|li|blockquote|ul|ol)\s*>/i.test(value)) text += '\n';
    } else if (!hidden) text += decodeText(value);
  }
  return text;
}
