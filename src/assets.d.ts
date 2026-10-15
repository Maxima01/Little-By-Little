declare module '*.css';

// Documents the narrow desktop bridge available to the browser renderer.
interface Window {
  novelDesktop?: {
    exportPdf: (options: { html: string; filename: string }) => Promise<{ canceled: boolean }>;
  };
}
