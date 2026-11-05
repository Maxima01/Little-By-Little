import { contentSecurityPolicy } from '../server/web.mjs';

// Feature: protect the file:// renderer before any resource loads and preserve offline Expo asset links.
export function prepareDesktopHtml(html, supabaseUrl) {
  // Ignore commented markup while retaining source offsets for the generated document.
  const markup = html.replace(/<!--[\s\S]*?-->/g, (comment) => ' '.repeat(comment.length));
  const head = /<head\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/i.exec(markup);
  const end = head && /<\/head\s*>/i.exec(markup.slice(head.index + head[0].length));
  if (!head || !end) throw new Error('Desktop export requires a complete HTML head before it can be secured.');

  // Meta policies cannot express frame-ancestors; desktop navigation/IPC protections enforce that boundary.
  // Turnstile is unsupported in the local renderer, so desktop never permits its remote executable script.
  const policy = contentSecurityPolicy(supabaseUrl)
    .split('; ')
    .filter((directive) => !directive.startsWith('frame-ancestors '))
    .join('; ')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
  const start = head.index + head[0].length;
  const finish = start + end.index;
  // Feature: repeated packaging replaces prior CSP metadata rather than accumulating conflicting policies.
  const securedHead = html.slice(start, finish).replace(/<!--[\s\S]*?-->|<meta\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi, (tag) => {
    if (tag.startsWith('<!--')) return tag;
    const attributes = [...tag.slice(5, -1).matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)];
    const equivalent = attributes.find((attribute) => attribute[1].toLowerCase() === 'http-equiv');
    return equivalent && /^content-security-policy$/i.test((equivalent[2] ?? equivalent[3] ?? equivalent[4] ?? '').trim()) ? '' : tag;
  });
  return `${html.slice(0, start)}<meta http-equiv="Content-Security-Policy" content="${policy}">${securedHead}${html.slice(finish)}`
    .replace(/\b(src|href)=(['"])\/(_expo\/[^'"]+)\2/g, '$1=$2./$3$2');
}
