// Feature: one offline font catalog keeps the editor, backups and document exports in sync.
export const WRITING_FONTS = [
  { value: 'Georgia', label: 'Georgia · Serif', category: 'Serif' },
  { value: 'Times New Roman', label: 'Times New Roman · Serif', category: 'Serif' },
  { value: 'Cambria', label: 'Cambria · Serif', category: 'Serif' },
  { value: 'Constantia', label: 'Constantia · Serif', category: 'Serif' },
  { value: 'Palatino Linotype', label: 'Palatino Linotype · Serif', category: 'Serif' },
  { value: 'Arial', label: 'Arial · Sans serif', category: 'Sans serif' },
  { value: 'Calibri', label: 'Calibri · Sans serif', category: 'Sans serif' },
  { value: 'Verdana', label: 'Verdana · Sans serif', category: 'Sans serif' },
  { value: 'Tahoma', label: 'Tahoma · Sans serif', category: 'Sans serif' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS · Sans serif', category: 'Sans serif' },
  { value: 'Segoe UI', label: 'Segoe UI · Sans serif', category: 'Sans serif' },
  { value: 'Courier New', label: 'Courier New · Monospace', category: 'Monospace' },
  { value: 'Consolas', label: 'Consolas · Monospace', category: 'Monospace' },
  { value: 'Lucida Console', label: 'Lucida Console · Monospace', category: 'Monospace' },
] as const;

export type WritingFontFamily = typeof WRITING_FONTS[number]['value'];

// Feature: validate saved and pasted font names against the same choices offered by the toolbar.
export function isWritingFontFamily(value: unknown): value is WritingFontFamily {
  return typeof value === 'string' && WRITING_FONTS.some((font) => font.value === value);
}
