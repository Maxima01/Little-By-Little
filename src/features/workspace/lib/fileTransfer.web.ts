import { cleanChapterHtml, exportFileName, storyDocx, storyEpub, storyHtml, storyText, type ExportFormat } from './exportDocument';
import type { Story, Workspace } from '../../../domain/model';
import { parseWorkspaceBackup } from './saveHistory';

// Downloads an offline-generated artifact and releases its temporary object URL after dispatch.
function download(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// Selects real file generators; browser PDF uses the system's Save as PDF print destination.
export async function exportStoryFile(story: Story, format: ExportFormat, language: string): Promise<string> {
  const name = exportFileName(story.title);
  if (format === 'pdf') {
    const html = storyHtml(story);
    if (window.novelDesktop) {
      const result = await window.novelDesktop.exportPdf({ html, filename: `${name}.pdf` });
      return result.canceled ? 'PDF export canceled.' : 'PDF saved.';
    }
    const frame = document.createElement('iframe');
    frame.title = 'Printable story';
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
    document.body.append(frame);
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Preparing the PDF timed out. Please try again.')), 15_000);
        frame.onload = () => { clearTimeout(timeout); resolve(); };
        frame.onerror = () => { clearTimeout(timeout); reject(new Error('Could not prepare the printable story.')); };
        frame.srcdoc = html;
      });
    } catch (error) { frame.remove(); throw error; }
    const printWindow = frame.contentWindow;
    if (!printWindow) { frame.remove(); throw new Error('The print window could not be opened.'); }
    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
    setTimeout(() => frame.remove(), 60_000);
    return 'Print dialog opened. Choose Save as PDF to finish.';
  }
  if (format === 'docx') download((await storyDocx(story)).buffer as ArrayBuffer, `${name}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  if (format === 'epub') download((await storyEpub(story, language)).buffer as ArrayBuffer, `${name}.epub`, 'application/epub+zip');
  if (format === 'txt' || format === 'md') download(storyText(story, format === 'md'), `${name}.${format}`, 'text/plain;charset=utf-8');
  if (format === 'html') download(storyHtml(story), `${name}.html`, 'text/html;charset=utf-8');
  return `${format.toUpperCase()} download started.`;
}

// Backs up every story and its supporting material for recovery outside local application storage.
export async function downloadWorkspaceBackup(workspace: Workspace) {
  download(JSON.stringify(workspace, null, 2), `little-by-little-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, 'application/json;charset=utf-8');
}

// Lets the writer choose a backup, validates it, and removes active chapter content before preview.
export async function chooseWorkspaceBackup(): Promise<Workspace | null> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  document.body.append(input);
  return new Promise((resolve, reject) => {
    input.oncancel = () => { input.remove(); resolve(null); };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { input.remove(); resolve(null); return; }
      try {
        if (file.size > 100 * 1024 * 1024) throw new Error('Choose a workspace backup smaller than 100 MB.');
        const workspace = parseWorkspaceBackup(await file.text());
        for (const story of workspace.stories) for (const chapter of story.chapters) chapter.html = cleanChapterHtml(chapter.html).innerHTML;
        resolve(workspace);
      } catch (error) { reject(error); }
      finally { input.remove(); }
    };
    input.click();
  });
}
