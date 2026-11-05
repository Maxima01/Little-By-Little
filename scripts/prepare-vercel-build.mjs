import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from '@expo/env';
import { prepareVercelOutput } from './vercel-output.mjs';

// Feature: derive deployed security headers from the same production settings used by the exported app.
loadProjectEnv(process.cwd(), { mode: 'production', silent: true });
const result = await prepareVercelOutput(fileURLToPath(new URL('../', import.meta.url)),
  process.env.EXPO_PUBLIC_SUPABASE_URL?.trim(), process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY?.trim());
console.log(`Vercel build prepared: ${result.count} public files, security headers and explicit 404 routing.`);
