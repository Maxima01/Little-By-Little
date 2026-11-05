import { loadProjectEnv } from '@expo/env';
import { publicCloudConfig } from '../src/features/workspace/lib/cloudConfig.ts';
import { publicCloudChallengeKey } from '../src/features/workspace/lib/cloudChallenge.ts';

// Feature: fail before Expo inlines public environment values, without logging credentials or their contents.
loadProjectEnv(process.cwd(), { mode: process.argv.includes('--development') ? 'development' : 'production', silent: true });
try {
  publicCloudConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  // Feature: validate optional bot-protection configuration before its public site key enters the web bundle.
  publicCloudChallengeKey(process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY);
} catch (error) {
  console.error(`Public configuration rejected: ${error.message}`);
  process.exitCode = 1;
}
