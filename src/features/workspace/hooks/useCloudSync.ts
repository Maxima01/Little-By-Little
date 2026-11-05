import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import type { Workspace } from '../../../domain/model';
import { cloudProjectKey, cloudRegistration, supabase } from '../lib/supabase';
import { signInCloudAccount, signUpCloudAccount } from '../lib/cloudAuth';
import type { AccountPolicyAcceptance } from '../../legal/lib/policyConsent';
import { CloudConflictError, cloudFingerprint, cloudSessionScope, createCloudRepository, decideCloudSync, readCloudSyncSettings, type CloudBaseline, type CloudSessionScope, type CloudSnapshot, type CloudSyncSettings } from '../lib/cloudSync';

type Conflict = { remote: CloudSnapshot | null; initial: boolean };
type ActiveSession = { scope: CloudSessionScope | null; accessToken: string };
type Props = {
  workspaceRef: RefObject<Workspace | null>;
  committedWorkspace: Workspace | null;
  saveNow: () => Promise<Workspace | undefined>;
  applyRemote: (workspace: Workspace, expected: Workspace, isCurrent: () => boolean) => Promise<void>;
};
export type CloudSyncController = {
  configured: boolean; email: string | null; status: string; error: string; busy: boolean;
  lastSyncedAt: string | null; conflict: Conflict | null; enabled: boolean;
  localStoryCount?: number; localUpdatedAt?: string;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<void>;
  signUp: (email: string, password: string, acceptance: AccountPolicyAcceptance, captchaToken?: string) => Promise<void>;
  signOut: () => Promise<void>; syncNow: () => Promise<void>;
  resolve: (choice: 'local' | 'cloud') => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
};
const SETTINGS_KEY = `little-by-little.cloud.v1:${cloudProjectKey}`;

// Feature: a workspace choice belongs to one login session. Reloading or refreshing that session preserves it.
export function useCloudSync(props: Props): CloudSyncController {
  const inputs = useRef(props); inputs.current = props;
  const [user, setUser] = useState<User | null>(null);
  const [enabled, updateEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(supabase ? 'Sign in to save in the cloud' : 'Cloud saves are not configured');
  const [error, setError] = useState('');
  const [conflict, updateConflict] = useState<Conflict | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const sessionRef = useRef<ActiveSession | null>(null);
  const baseline = useRef<CloudBaseline | null>(null);
  const remoteCache = useRef<CloudSnapshot | null>(null);
  const enabledRef = useRef(true);
  const conflictRef = useRef<Conflict | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  const ready = useRef(false);

  // Feature: conflicts stop background uploads until the writer reviews the complete workspace choice.
  const showConflict = useCallback((next: Conflict | null) => {
    conflictRef.current = next; updateConflict(next);
    if (next) setStatus(next.initial ? 'Choose a workspace to start syncing' : 'Cloud sync needs a workspace choice');
  }, []);

  // Feature: persist only acknowledged cloud contents; a failed request never advances the sync baseline.
  const remember = useCallback(async (scope: CloudSessionScope, next: CloudSnapshot | null, active = enabledRef.current) => {
    const token = generation.current;
    if (sessionRef.current?.scope !== scope) return;
    const nextBaseline = next ? { revision: next.revision, fingerprint: cloudFingerprint(next.workspace) } : baseline.current;
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...scope, baseline: nextBaseline, enabled: active } satisfies CloudSyncSettings));
    if (generation.current !== token || sessionRef.current?.scope !== scope) return;
    baseline.current = nextBaseline;
    if (next) { remoteCache.current = next; setLastSyncedAt(next.savedAt); }
  }, []);

  // Feature: serialize network work and reject late results from a signed-out or replaced login.
  const sync = useCallback(async (choice?: 'local' | 'cloud') => {
    const client = supabase;
    const scope = sessionRef.current?.scope;
    if (!client || !scope || !ready.current || running.current || (!enabledRef.current && !choice)) return;
    if (Boolean(conflictRef.current) !== Boolean(choice)) return;
    const token = generation.current;
    const valid = () => generation.current === token && sessionRef.current?.scope === scope;
    const repository = createCloudRepository(client, scope.userId, () => {
      const active = sessionRef.current;
      if (generation.current !== token || active?.scope !== scope) throw new Error('The signed-in session changed. Sync again.');
      return active.accessToken;
    });
    running.current = true; setBusy(true); setError(''); setStatus('Checking cloud saves…');
    try {
      // Only durable local snapshots may leave the device. A newer open edit waits for local autosave.
      const durable = choice ? await inputs.current.saveNow() : inputs.current.committedWorkspace;
      if (!valid()) return;
      const local = inputs.current.workspaceRef.current;
      if (!local) throw new Error('Load your local workspace before syncing.');
      if (local !== durable) { setStatus('Waiting for local save'); return; }
      const remote = await repository.read(choice ? undefined : remoteCache.current);
      if (!valid()) return;
      remoteCache.current = remote;
      if (choice && remote?.revision !== conflictRef.current?.remote?.revision) {
        showConflict({ remote, initial: !baseline.current });
        throw new Error('The cloud workspace changed while you were choosing. Review the updated copy and choose again.');
      }
      if (inputs.current.workspaceRef.current !== local) { setStatus('Waiting for local save'); return; }
      const decision = choice === 'local' ? 'upload' : choice === 'cloud' ? 'download' : decideCloudSync(local, baseline.current, remote);
      if (decision === 'conflict' || decision === 'link') {
        showConflict({ remote, initial: decision === 'link' }); return;
      }
      let acknowledged = remote;
      if (decision === 'upload') {
        setStatus('Saving to cloud…');
        acknowledged = await repository.write(local, remote?.revision ?? 0);
      } else if (decision === 'download') {
        if (!remote) throw new Error('No cloud workspace is available. Choose this device to start a new cloud copy.');
        setStatus('Receiving cloud workspace…');
        await inputs.current.applyRemote(remote.workspace, local, valid);
      }
      if (!valid() || !acknowledged) return;
      await remember(scope, acknowledged);
      if (!valid()) return;
      showConflict(null); setStatus('Saved in cloud');
    } catch (failure) {
      if (!valid()) return;
      if (failure instanceof CloudConflictError) {
        // Refresh the preview after a racing writer wins the server's compare-and-swap.
        try {
          const remote = await repository.read();
          if (valid()) showConflict({ remote, initial: !baseline.current });
        } catch { if (valid()) setStatus('Cloud sync will retry'); }
      } else if (!conflictRef.current) setStatus('Cloud sync will retry · local saves continue');
      if (!valid()) return;
      setError(failure instanceof Error ? failure.message : 'Could not sync. Check your connection, then select Sync now.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [remember, showConflict]);

  // Feature: load session-scoped state without running Supabase calls inside its auth-state callback.
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let mounted = true;
    let authEventReceived = false;
    const accountChanged = async (next: Session | null) => {
      if (!mounted) return;
      const nextScope = cloudSessionScope(next);
      const previousScope = sessionRef.current?.scope;
      if (next && nextScope && previousScope?.sessionId === nextScope.sessionId && previousScope.userId === nextScope.userId) {
        sessionRef.current = { scope: previousScope, accessToken: next.access_token };
        setUser(next.user);
        return;
      }
      const token = ++generation.current;
      ready.current = false; baseline.current = null; remoteCache.current = null;
      sessionRef.current = next ? { scope: nextScope, accessToken: next.access_token } : null;
      showConflict(null); setLastSyncedAt(null); setError('');
      setUser(next?.user ?? null); setBusy(running.current);
      if (!next) {
        updateEnabled(true); enabledRef.current = true; setStatus('Sign in to save in the cloud');
        // Feature: clear the ended login's preferences even when the SDK signs out independently.
        if (previousScope) {
          void AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
            if (generation.current === token && readCloudSyncSettings(raw, previousScope)) return AsyncStorage.removeItem(SETTINGS_KEY);
          }).catch(() => { /* A later session still rejects the old preference record. */ });
        }
        return;
      }
      if (!nextScope) {
        updateEnabled(false); enabledRef.current = false;
        setStatus('Cloud sync needs a new sign-in');
        setError('Sign out and sign in again to connect cloud saves.');
        return;
      }
      setStatus('Checking cloud sync settings…');
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (!mounted || generation.current !== token) return;
        const stored = readCloudSyncSettings(raw, nextScope);
        baseline.current = stored?.baseline ?? null;
        enabledRef.current = stored?.enabled ?? true;
        updateEnabled(enabledRef.current); ready.current = true;
        setStatus(enabledRef.current ? 'Ready to sync' : 'Cloud sync paused');
      } catch {
        if (mounted && generation.current === token) {
          ready.current = true; enabledRef.current = true; updateEnabled(true);
          setError('Could not read sync settings. Review your workspace choice before syncing.');
          setStatus('Ready to connect cloud saves');
        }
      }
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => { authEventReceived = true; void accountChanged(session); });
    void client.auth.getSession().then(({ data, error: failure }) => {
      if (failure && mounted) setError('Could not load your cloud session. Try signing in again.');
      if (mounted && !authEventReceived) void accountChanged(data.session);
    }).catch(() => { if (mounted) setError('Could not load your cloud session. Try signing in again.'); });
    return () => { mounted = false; generation.current += 1; ready.current = false; sessionRef.current = null; subscription.unsubscribe(); };
  }, [showConflict]);

  // Feature: debounce successful local commits; polling/focus/reconnect receive other devices' changes.
  useEffect(() => {
    if (!user || !enabled) return;
    const timer = setTimeout(() => { void sync(); }, 1_200);
    return () => clearTimeout(timer);
  }, [props.committedWorkspace, user, enabled, status === 'Ready to sync', sync]);
  useEffect(() => {
    if (!user || !enabled) return;
    const refresh = () => { void sync(); };
    const interval = setInterval(refresh, 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { if (Platform.OS !== 'web') supabase?.auth.startAutoRefresh(); refresh(); }
      else if (Platform.OS !== 'web') supabase?.auth.stopAutoRefresh();
    });
    if (Platform.OS === 'web') { window.addEventListener('online', refresh); window.addEventListener('focus', refresh); }
    return () => {
      clearInterval(interval); subscription.remove();
      if (Platform.OS === 'web') { window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); }
    };
  }, [user?.id, enabled, sync]);

  // Feature: account forms share bounded inputs and safe errors while local writing remains independent of login.
  const signIn = (email: string, password: string, captchaToken?: string) => signInCloudAccount(supabase, email, password, captchaToken);
  // Feature: forward explicit policy acknowledgments without connecting manuscript data prematurely.
  const signUp = (email: string, password: string, acceptance: AccountPolicyAcceptance, captchaToken?: string) => signUpCloudAccount(cloudRegistration, email, password, acceptance, captchaToken);
  // Feature: signing out leaves local stories intact and requires an explicit workspace choice next time.
  const signOut = async () => {
    if (!supabase || running.current) return;
    running.current = true; setBusy(true);
    try {
      // Feature: leave preference cleanup to the auth transition so it also runs on SDK-initiated sign-outs.
      const { error: failure } = await supabase.auth.signOut({ scope: 'local' });
      if (failure) throw failure;
    } finally { running.current = false; setBusy(false); }
  };
  // Feature: pause is device-specific and retains the baseline needed to detect offline conflicts on resume.
  const setEnabled = async (active: boolean) => {
    const scope = sessionRef.current?.scope;
    if (!scope || !ready.current || running.current) return;
    const token = generation.current;
    running.current = true; setBusy(true);
    try {
      await remember(scope, null, active);
      if (generation.current !== token || sessionRef.current?.scope !== scope) return;
      enabledRef.current = active; updateEnabled(active);
      setStatus(active ? 'Ready to sync' : 'Cloud sync paused');
    } finally { running.current = false; setBusy(false); }
    if (active && generation.current === token) await sync();
  };
  return {
    configured: !!supabase, email: user?.email ?? null, status, error, busy, enabled, conflict, lastSyncedAt,
    localStoryCount: props.workspaceRef.current?.stories.length, localUpdatedAt: props.workspaceRef.current?.updatedAt,
    signIn, signUp, signOut, syncNow: () => sync(),
    // Feature: a stale button event cannot approve the workspace choice of a newer login.
    resolve: (choice) => conflict && conflictRef.current === conflict ? sync(choice) : Promise.resolve(),
    setEnabled,
  };
}


