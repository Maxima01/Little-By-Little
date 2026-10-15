import { chapterPassages } from './chapterRecovery.ts';
import { countWords } from '../../../domain/model.ts';

// Feature: estimate print-page groups without losing loose text or splitting nested rich markup.
export function estimatedPreviewPages(html: string) {
  const pages: string[] = [];
  let current = '';
  let words = 0;
  for (const passage of chapterPassages(html)) {
    const nextWords = countWords(passage.html);
    if (words && words + nextWords > 430) {
      pages.push(current); current = ''; words = 0;
    }
    current += passage.html;
    words += nextWords;
  }
  if (current || !pages.length) pages.push(current || html);
  return pages;
}
