import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Workspace } from '../../../domain/model.ts';
import { isWorkspace } from './saveHistory.ts';

// Feature: a cloud revision identifies the last account snapshot acknowledged by this device.
export type CloudSnapshot = { revision: number; workspace: Workspace; savedAt: string };
export type CloudBaseline = { revision: number; fingerprint: string };
export type CloudSessionScope = { userId: string; sessionId: string };
export type CloudSyncSettings = CloudSessionScope & { baseline: CloudBaseline | null; enabled: boolean };
export type CloudSyncDecision = 'link' | 'upload' | 'download' | 'conflict' | 'synced';
// Feature: the same upload quota bounds client work before the database enforces its storage limit.
export const MAX_CLOUD_BYTES = 20 * 1024 * 1024;

// Converts backend failures to bounded, actionable messages instead of displaying database diagnostics.
function cloudError(error: { code?: string }): Error {
  if (error.code === '40001') return new CloudConflictError();
  if (error.code === 'PGRST301' || error.code === '28000' || error.code === '42501') return new Error('Sign in again before accessing cloud saves.');
  if (error.code === 'P0429') return new Error('Cloud request limit reached. Wait a minute before syncing again.');
  if (error.code === '22023' || error.code === '23514') return new Error('The cloud workspace is invalid or exceeds the 20 MiB cloud limit. Local stories are unchanged.');
  return new Error('Cloud saves are temporarily unavailable. Your local stories are unchanged. Try again later.');
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const SESSION_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

// Feature: store a fixed-size change detector instead of another plaintext manuscript in sync preferences.
function digestFingerprint(canonical: string): string {
  return `sha256:${bytesToHex(sha256(utf8ToBytes(canonical)))}`;
}

// Feature: scope local sync approval to the stable login ID, even when Supabase refreshes the access token.
// This decodes only a local identifier. The server still verifies the token and authorizes each request.
export function cloudSessionScope(session: Pick<Session, 'access_token' | 'user'> | null): CloudSessionScope | null {
  if (!session?.user?.id || !session.access_token) return null;
  const parts = session.access_token.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || parts.some((part) => !part) || payload.length % 4 === 1) return null;
  let json = '';
  let bits = 0;
  let bitCount = 0;
  // Decode Base64URL without relying on browser globals in native builds. Both claims are ASCII.
  for (const character of payload) {
    const value = BASE64URL.indexOf(character);
    if (value < 0) return null;
    bits = (bits << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      json += String.fromCharCode((bits >> bitCount) & 255);
    }
  }
  try {
    const claims = JSON.parse(json) as { sub?: unknown; session_id?: unknown } | null;
    if (claims?.sub !== session.user.id || typeof claims.session_id !== 'string' || !SESSION_ID.test(claims.session_id)) return null;
    return { userId: session.user.id, sessionId: claims.session_id };
  } catch { return null; }
}

// Feature: previous logins and legacy settings cannot authorize a new session to upload local drafts.
export function readCloudSyncSettings(raw: string | null, scope: CloudSessionScope): CloudSyncSettings | null {
  const stored = raw ? JSON.parse(raw) as Partial<CloudSyncSettings> | null : null;
  if (stored?.userId !== scope.userId || stored.sessionId !== scope.sessionId || typeof stored.enabled !== 'boolean') return null;
  const baseline = stored.baseline;
  const validBaseline = baseline && Number.isSafeInteger(baseline.revision) && baseline.revision > 0 && typeof baseline.fingerprint === 'string';
  // Feature: upgrade the old canonical JSON baseline without losing approved-session conflict detection.
  const fingerprint = validBaseline && (DIGEST.test(baseline.fingerprint) ? baseline.fingerprint
    : baseline.fingerprint.startsWith('{') ? digestFingerprint(baseline.fingerprint) : null);
  return { ...scope, enabled: stored.enabled, baseline: fingerprint ? { revision: baseline!.revision, fingerprint } : null };
}

// Feature: JSONB can reorder object keys, so compare canonical data while retaining array order.
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonicalValue(item)]));
  }
  return value;
}

// Feature: restoring changes the workspace timestamp; all manuscript and nested timestamps remain comparable.
export function cloudFingerprint(workspace: Workspace): string {
  const { updatedAt: _restoredAt, ...content } = workspace;
  return digestFingerprint(JSON.stringify(canonicalValue(content)));
}

// Feature: compare both devices with their common baseline instead of silently overwriting concurrent edits.
export function decideCloudSync(local: Workspace, baseline: CloudBaseline | null, remote: CloudSnapshot | null): CloudSyncDecision {
  // Matching copies still need explicit approval before this login can upload subsequent edits.
  if (!baseline) return 'link';
  if (!remote) return 'conflict';
  const localFingerprint = cloudFingerprint(local);
  const remoteFingerprint = cloudFingerprint(remote.workspace);
  if (localFingerprint === remoteFingerprint) return 'synced';
  if (remote.revision < baseline.revision) return 'conflict';
  if (localFingerprint === baseline.fingerprint) return 'download';
  if (remoteFingerprint === baseline.fingerprint) return 'upload';
  return 'conflict';
}

// Feature: distinguish an optimistic-concurrency failure from offline and authentication errors.
export class CloudConflictError extends Error {
  // Gives the sync controller an actionable signal to refetch and offer conflict resolution.
  constructor(message = 'Another device saved newer work. Review the cloud copy before syncing again.') {
    super(message);
    this.name = 'CloudConflictError';
  }
}

// Feature: validate lightweight poll metadata before trusting a revision or its timestamp.
function decodeMetadata(value: unknown): Pick<CloudSnapshot, 'revision' | 'savedAt'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The cloud save has an invalid format. Your local stories are unchanged.');
  const row = value as Record<string, unknown>;
  if (typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) || row.revision <= 0
    || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) {
    throw new Error('The cloud save could not be validated. Your local stories are unchanged.');
  }
  return { revision: row.revision, savedAt: row.updated_at };
}

// Feature: reject malformed cloud data before it can replace local stories or become a trusted baseline.
function decodeSnapshot(value: unknown): CloudSnapshot {
  const metadata = decodeMetadata(value);
  const row = value as Record<string, unknown>;
  if (!isWorkspace(row.workspace)) throw new Error('The cloud save could not be validated. Your local stories are unchanged.');
  return { ...metadata, workspace: row.workspace };
}

// Feature: scope reads to one account and require a server-side revision comparison for every upload.
export function createCloudRepository(client: SupabaseClient, userId: string, getAccessToken?: () => string) {
  if (!userId) throw new Error('Sign in before accessing cloud saves.');

  // Reads the account snapshot; known content needs only metadata until its cloud revision changes.
  async function read(known?: CloudSnapshot | null): Promise<CloudSnapshot | null> {
    const request = client.rpc('read_cloud_workspace', { p_user_id: userId, p_known_revision: known?.revision ?? null });
    // Feature: keep in-flight requests on their initiating login even when another tab changes the SDK session.
    const { data, error } = await (getAccessToken ? request.setHeader('Authorization', `Bearer ${getAccessToken()}`) : request);
    if (error) throw cloudError(error);
    if (!Array.isArray(data) || data.length > 1) throw new Error('The cloud save has an invalid format. Your local stories are unchanged.');
    if (!data.length) return null;
    const metadata = decodeMetadata(data[0]);
    if (known && metadata.revision === known.revision && metadata.savedAt === known.savedAt && data[0].workspace === null) return known;
    return decodeSnapshot(data[0]);
  }

  // Uploads only for the expected account and revision; zero explicitly creates the first cloud save.
  async function write(workspace: Workspace, expectedRevision: number): Promise<CloudSnapshot> {
    if (!isWorkspace(workspace)) throw new Error('The workspace is invalid and could not be uploaded.');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('The cloud revision is invalid. Sync again before uploading.');
    if (new TextEncoder().encode(JSON.stringify(workspace)).byteLength > MAX_CLOUD_BYTES) throw new Error('The workspace exceeds the 20 MiB cloud limit. Local stories are unchanged.');
    const request = client.rpc('save_cloud_workspace', { p_workspace: workspace, p_expected_revision: expectedRevision, p_user_id: userId });
    const { data, error } = await (getAccessToken ? request.setHeader('Authorization', `Bearer ${getAccessToken()}`) : request);
    if (error) throw cloudError(error);
    if (!Array.isArray(data) || data.length !== 1) throw new Error('The cloud save was not acknowledged. Sync again to check its status.');
    return decodeSnapshot(data[0]);
  }

  return { read, write };
}
