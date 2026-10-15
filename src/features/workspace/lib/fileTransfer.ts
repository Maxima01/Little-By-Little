import type { ExportFormat } from './exportDocument';
import type { Story, Workspace } from '../../../domain/model';

// Makes platform limitations visible rather than silently doing nothing on native devices.
export async function exportStoryFile(_story: Story, _format: ExportFormat, _language: string): Promise<string> {
  throw new Error('File export is available in the desktop app or a web browser.');
}

// Keeps the backup action explicit until native file sharing is implemented.
export async function downloadWorkspaceBackup(_workspace: Workspace): Promise<void> {
  throw new Error('Backup downloads are available in the desktop app or a web browser.');
}

// Keeps import errors actionable on devices without a supported file picker.
export async function chooseWorkspaceBackup(): Promise<Workspace | null> {
  throw new Error('Backup import is available in the desktop app or a web browser.');
}
