import { createElement, useMemo } from 'react';
import { cleanChapterHtml } from '../../workspace/lib/exportDocument';
import type { Chapter } from '../../../domain/model';

// Feature: render the entire safe fragment in reading order, preserving inline text, lists and styles.
export default function PreviewBody({ html, chapter }: { html: string; chapter: Chapter }) {
  const safeHtml = useMemo(() => cleanChapterHtml(html).innerHTML, [html]);
  return createElement('div', {
    className: 'writer-preview-body',
    style: { fontFamily: chapter.fontFamily ?? 'Georgia', fontSize: chapter.fontSize ?? 16 },
    dangerouslySetInnerHTML: { __html: safeHtml },
  });
}
