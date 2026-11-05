import type { SupportedStorage } from '@supabase/supabase-js';

// Feature: web and Electron retain the Supabase client's browser storage adapter.
export const nativeAuthStorage: SupportedStorage | undefined = undefined;
