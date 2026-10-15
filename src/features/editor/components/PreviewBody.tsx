import { EnrichedTextInput } from 'react-native-enriched-html';
import type { Chapter } from '../../../domain/model';

// Feature: native previews pass the whole rich fragment to the reader so leading inline text survives.
export default function PreviewBody({ html, chapter }: { html: string; chapter: Chapter }) {
  return <EnrichedTextInput defaultValue={html} editable={false} scrollEnabled={false}
    style={{ minHeight: 24, color: '#302a36', fontFamily: chapter.fontFamily ?? 'Georgia', fontSize: chapter.fontSize ?? 16, lineHeight: Math.round((chapter.fontSize ?? 16) * 1.8), padding: 0, backgroundColor: 'transparent' }}
    htmlStyle={{ h1: { fontSize: 30, bold: true }, h2: { fontSize: 24, bold: true }, h3: { fontSize: 19, bold: true }, blockquote: { borderColor: '#67518f', borderWidth: 3, color: '#625c6b' } }} />;
}
