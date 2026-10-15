import { AlignmentType, Document, ExternalHyperlink, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import type { Story } from '../../../domain/model.ts';

export type ExportFormat = 'pdf' | 'epub' | 'docx' | 'md' | 'txt' | 'html';
export const EXPORT_FORMATS: { id: ExportFormat; title: string; detail: string }[] = [
  { id: 'pdf', title: 'PDF', detail: 'Read or print · fixed pages' },
  { id: 'epub', title: 'EPUB', detail: 'Read on an e-reader · adjustable text' },
  { id: 'docx', title: 'Word (.docx)', detail: 'Edit in Word, Google Docs, or LibreOffice' },
  { id: 'md', title: 'Markdown (.md)', detail: 'Edit in a text editor · basic formatting' },
  { id: 'txt', title: 'Plain text (.txt)', detail: 'Simple, portable text · no formatting' },
  { id: 'html', title: 'HTML', detail: 'Read in a browser · rich formatting' },
];
type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; href?: string; font?: string; size?: number };
type Block = { runs: Run[]; heading?: number; quote?: boolean; alignment?: 'left' | 'center' | 'right' | 'justify'; list?: { id: string; ordered: boolean; level: number; number: number } };

// Escapes user titles and metadata for HTML and XML containers.
export function escapeMarkup(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

// Retains Unicode titles while removing reserved filesystem characters and trailing dots.
export function exportFileName(value: string) {
  const name = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 100).replace(/[. ]+$/g, '') || 'story';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name) ? `story-${name}` : name;
}

// Allows safe hyperlinks without executing scripts or fetching embedded resources.
function safeLink(value: string) {
  return /^(https?:\/\/|mailto:)/i.test(value.trim()) ? value.trim() : undefined;
}

// Removes active content from pasted/imported HTML while retaining supported writing styles.
export function cleanChapterHtml(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  const allowed = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SPAN', 'A', 'PRE', 'CODE']);
  // Walks descendants from leaves upward so replacement cannot skip unsafe children.
  for (let element of Array.from(root.querySelectorAll('*')).reverse()) {
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'NOSCRIPT', 'TEMPLATE'].includes(element.tagName)) { element.remove(); continue; }
    if (element.tagName === 'FONT' || element.tagName === 'STRIKE') {
      const replacement = document.createElement(element.tagName === 'STRIKE' ? 's' : 'span');
      if (element.tagName === 'FONT' && element.getAttribute('face')) replacement.style.fontFamily = element.getAttribute('face')!;
      replacement.append(...Array.from(element.childNodes));
      element.replaceWith(replacement);
      element = replacement;
    }
    if (!allowed.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); continue; }
    const styled = element as HTMLElement;
    const styles = styled.style;
    const align = styles.textAlign || element.getAttribute('align') || '';
    const declarations: string[] = [];
    if (['left', 'center', 'right', 'justify'].includes(align)) declarations.push(`text-align:${align}`);
    if (/^(bold|[6-9]00)$/.test(styles.fontWeight)) declarations.push('font-weight:bold');
    if (styles.fontStyle === 'italic') declarations.push('font-style:italic');
    if (/^(underline|line-through)( (underline|line-through))?$/.test(styles.textDecorationLine || styles.textDecoration)) declarations.push(`text-decoration:${styles.textDecorationLine || styles.textDecoration}`);
    const font = styles.fontFamily.replace(/["']/g, '');
    if (['Georgia', 'Arial', 'Courier New'].includes(font)) declarations.push(`font-family:${font}`);
    if (/^\d+(\.\d+)?(px|pt)$/.test(styles.fontSize) && parseFloat(styles.fontSize) <= 128) declarations.push(`font-size:${styles.fontSize}`);
    const href = element.tagName === 'A' ? safeLink(element.getAttribute('href') ?? '') : undefined;
    const start = element.tagName === 'OL' ? element.getAttribute('start') : undefined;
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
    if (declarations.length) element.setAttribute('style', declarations.join(';'));
    if (href) element.setAttribute('href', href);
    if (start && /^\d{1,5}$/.test(start)) element.setAttribute('start', start);
  }
  return root;
}

// Converts safe inline HTML into text runs for editable Word and portable text exports.
function inlineRuns(node: Node, inherited: Omit<Run, 'text'> = {}): Run[] {
  if (node.nodeType === 3) return [{ ...inherited, text: node.textContent ?? '' }];
  if (node.nodeType !== 1) return [];
  const element = node as HTMLElement;
  if (element.tagName === 'BR') return [{ ...inherited, text: '\n' }];
  if (['UL', 'OL'].includes(element.tagName)) return [];
  const style = element.style;
  const size = parseFloat(style.fontSize);
  const formatting = {
    ...inherited,
    bold: inherited.bold || ['B', 'STRONG'].includes(element.tagName) || style.fontWeight === 'bold',
    italic: inherited.italic || ['I', 'EM'].includes(element.tagName) || style.fontStyle === 'italic',
    underline: inherited.underline || element.tagName === 'U' || style.textDecoration.includes('underline'),
    strike: inherited.strike || element.tagName === 'S' || style.textDecoration.includes('line-through'),
    href: element.getAttribute('href') ?? inherited.href,
    font: style.fontFamily.replace(/["']/g, '') || inherited.font,
    size: Number.isFinite(size) ? size * (style.fontSize.endsWith('px') ? 0.75 : 1) : inherited.size,
  };
  return Array.from(element.childNodes).flatMap((child) => inlineRuns(child, formatting));
}

// Keeps paragraph boundaries, headings, quotes, and nested list order in every text-based format.
function blocksFromHtml(html: string): Block[] {
  const root = cleanChapterHtml(html);
  const blocks: Block[] = [];
  let listCounter = 0;
  // Flattens block containers while preserving a list item's nesting and numbering.
  function visit(element: HTMLElement, quote = false, level = 0) {
    if (['UL', 'OL'].includes(element.tagName)) {
      const id = `list-${listCounter++}`;
      let number = Number(element.getAttribute('start') ?? 1);
      for (const child of Array.from(element.children) as HTMLElement[]) {
        blocks.push({ runs: inlineRuns(child), quote, list: { id, ordered: element.tagName === 'OL', level: Math.min(level, 8), number: number++ } });
        for (const nested of Array.from(child.children) as HTMLElement[]) if (['UL', 'OL'].includes(nested.tagName)) visit(nested, quote, level + 1);
      }
      return;
    }
    const blockChildren = Array.from(element.children).some((child) => /^(P|DIV|H[1-6]|BLOCKQUOTE|UL|OL|PRE)$/.test(child.tagName));
    if (blockChildren) {
      let loose: Run[] = [];
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === 1 && /^(P|DIV|H[1-6]|BLOCKQUOTE|UL|OL|PRE)$/.test((child as Element).tagName)) {
          if (loose.some((run) => run.text.trim())) blocks.push({ runs: loose, quote });
          loose = [];
          visit(child as HTMLElement, quote || element.tagName === 'BLOCKQUOTE', level);
        } else loose.push(...inlineRuns(child));
      }
      if (loose.some((run) => run.text.trim())) blocks.push({ runs: loose, quote });
    } else blocks.push({ runs: inlineRuns(element), heading: /^H[1-6]$/.test(element.tagName) ? Number(element.tagName[1]) : undefined, quote: quote || element.tagName === 'BLOCKQUOTE', alignment: element.style.textAlign as Block['alignment'] });
  }
  visit(root);
  return blocks;
}

// Exports chapters in their current order with paragraph spacing and decoded Unicode entities.
export function storyText(story: Story, markdown = false): string {
  // Escapes Markdown punctuation in source text so it cannot become unintended formatting.
  const escapeText = (value: string) => value.replace(/([\\`*_{}\[\]<>#!|~])/g, '\\$1');
  // Applies only the inline styles that Markdown can represent portably.
  const runText = (run: Run) => {
    if (!markdown) return run.text;
    let value = escapeText(run.text);
    if (!value.trim()) return value;
    const leading = value.match(/^\s*/)?.[0] ?? '';
    const trailing = value.match(/\s*$/)?.[0] ?? '';
    value = value.trim();
    if (run.bold) value = `**${value}**`;
    if (run.italic) value = `*${value}*`;
    if (run.strike) value = `~~${value}~~`;
    if (run.href) value = `[${value}](${run.href.replace(/[()]/g, (char) => encodeURIComponent(char))})`;
    return leading + value + trailing;
  };
  return [markdown ? `# ${escapeText(story.title)}` : story.title, ...story.chapters.map((chapter) => {
    const blocks = blocksFromHtml(chapter.html).map((block) => {
      let value = block.runs.map(runText).join('');
      if (block.list) value = `${'  '.repeat(block.list.level)}${block.list.ordered ? `${block.list.number}.` : '-'} ${value}`;
      if (markdown && block.heading) value = `${'#'.repeat(Math.min(block.heading + 2, 6))} ${value}`;
      if (block.quote) value = value.split('\n').map((line) => `> ${line}`).join('\n');
      return value;
    }).join('\n\n');
    return `${markdown ? `## ${escapeText(chapter.title)}` : chapter.title}\n\n${blocks}`;
  })].join('\n\n') + '\n';
}

// Builds a printable manuscript using safe chapter markup and each chapter's type preferences.
export function storyHtml(story: Story) {
  // Feature: saved chapter sizes use screen pixels in preview and print; Word converts them to point units.
  const chapters = story.chapters.map((chapter) => `<section style="font-family:${chapter.fontFamily ?? 'Georgia'};font-size:${chapter.fontSize ?? 16}px"><h1>${escapeMarkup(chapter.title)}</h1>${cleanChapterHtml(chapter.html).innerHTML}</section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeMarkup(story.title)}</title><style>@page{size:A4;margin:22mm}body{max-width:760px;margin:48px auto;padding:0 24px;font:12pt/1.65 Georgia,serif;color:#27232c;background:white}.title-page{text-align:center;padding-top:20vh;break-after:page}section+section{break-before:page}h1,h2,h3{break-after:avoid}blockquote{border-left:2px solid #aaa;padding-left:1em}p{orphans:3;widows:3}@media print{body{max-width:none;margin:0;padding:0}}</style></head><body><div class="title-page"><h1>${escapeMarkup(story.title)}</h1></div>${chapters}</body></html>`;
}

// Produces a genuine OOXML document with editable text, headings, emphasis, alignment, and lists.
export async function storyDocx(story: Story): Promise<Uint8Array> {
  const paragraphs: Paragraph[] = [new Paragraph({ text: story.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER })];
  const numbering: { reference: string; levels: any[] }[] = [];
  story.chapters.forEach((chapter, chapterIndex) => {
    paragraphs.push(new Paragraph({ text: chapter.title, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    const blocks = blocksFromHtml(chapter.html);
    for (const block of blocks) {
      const reference = `${chapterIndex}-${block.list?.id}`;
      if (block.list && !numbering.some((list) => list.reference === reference)) {
        numbering.push({ reference, levels: Array.from({ length: 9 }, (_, level) => ({ level, format: block.list!.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET, text: block.list!.ordered ? `%${level + 1}.` : '•', start: block.list!.number, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } })) });
      }
      // Converts line breaks to Word break elements instead of embedding raw newlines in XML text.
      const runs = block.runs.flatMap((run) => run.text.split('\n').map((text, index) => {
        // Feature: inline sizes are already in points; the inherited chapter pixel size needs a 3/4 conversion.
        const textRun = new TextRun({ text, break: index ? 1 : undefined, bold: run.bold, italics: run.italic, underline: run.underline ? {} : undefined, strike: run.strike, font: run.font || chapter.fontFamily || 'Georgia', size: Math.round((run.size ?? (chapter.fontSize ?? 16) * 0.75) * 2) });
        return run.href ? new ExternalHyperlink({ link: run.href, children: [textRun] }) : textRun;
      }));
      paragraphs.push(new Paragraph({ children: runs, heading: block.heading ? [HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6, HeadingLevel.HEADING_6][block.heading - 1] : undefined, alignment: block.alignment === 'justify' ? AlignmentType.JUSTIFIED : block.alignment, indent: block.quote ? { left: 720 } : undefined, numbering: block.list ? { reference, level: block.list.level } : undefined, spacing: { after: 180, line: 360 } }));
    }
  });
  const doc = new Document({ title: story.title, creator: 'Little by Little', numbering: { config: numbering }, sections: [{ properties: { page: { margin: { top: 1247, bottom: 1247, left: 1247, right: 1247 } } }, children: paragraphs }] });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

// Packages EPUB 3 with an uncompressed first mimetype entry, metadata, navigation, and chapter spine.
export async function storyEpub(story: Story, language = 'en'): Promise<Uint8Array> {
  const zip = new JSZip();
  const lang = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language) ? language : 'en';
  const title = escapeMarkup(story.title);
  // Wraps generated markup in a valid XHTML document accepted by EPUB readers.
  const xhtml = (pageTitle: string, body: string) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"><head><title>${escapeMarkup(pageTitle)}</title><link rel="stylesheet" href="style.css"/></head><body>${body}</body></html>`;
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/style.css', 'body{font-family:serif;line-height:1.6;margin:5%}h1{margin:1.5em 0}blockquote{margin-left:1.5em}p{orphans:3;widows:3}');
  zip.file('OEBPS/title.xhtml', xhtml(story.title, `<h1>${title}</h1>`));
  const chapterItems = story.chapters.map((chapter, index) => {
    const root = cleanChapterHtml(chapter.html);
    const serializer = new XMLSerializer();
    const markup = Array.from(root.childNodes).map((node) => serializer.serializeToString(node)).join('');
    zip.file(`OEBPS/chapter-${index}.xhtml`, xhtml(chapter.title, `<h1>${escapeMarkup(chapter.title)}</h1>${markup}`));
    return `<item id="chapter-${index}" href="chapter-${index}.xhtml" media-type="application/xhtml+xml"/>`;
  });
  zip.file('OEBPS/nav.xhtml', xhtml('Contents', `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="title.xhtml">${title}</a></li>${story.chapters.map((chapter, index) => `<li><a href="chapter-${index}.xhtml">${escapeMarkup(chapter.title)}</a></li>`).join('')}</ol></nav>`));
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:little-by-little:${escapeMarkup(story.id)}</dc:identifier><dc:title>${title}</dc:title><dc:language>${lang}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/><item id="style" href="style.css" media-type="text/css"/><item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>${chapterItems.join('')}</manifest><spine><itemref idref="title"/>${story.chapters.map((_, index) => `<itemref idref="chapter-${index}"/>`).join('')}</spine></package>`);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/epub+zip' });
}
