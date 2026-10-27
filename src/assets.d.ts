declare module '*.css';

// Documents the narrow desktop bridge available to the browser renderer.
interface Window {
  novelDesktop?: {
    // Feature: scoped desktop backup operations never expose arbitrary filesystem access.
    getBackupStatus: () => Promise<import('./features/workspace/lib/externalBackup').ExternalBackupStatus>;
    saveBackup: (raw: string, checkpoint?: boolean) => Promise<import('./features/workspace/lib/externalBackup').ExternalBackupStatus>;
    chooseBackupFolder: () => Promise<import('./features/workspace/lib/externalBackup').ExternalBackupStatus>;
    setBackupEnabled: (enabled: boolean) => Promise<import('./features/workspace/lib/externalBackup').ExternalBackupStatus>;
    openBackupFolder: () => Promise<import('./features/workspace/lib/externalBackup').ExternalBackupStatus>;
    exportPdf: (options: { html: string; filename: string }) => Promise<{ canceled: boolean }>;
  };
}
