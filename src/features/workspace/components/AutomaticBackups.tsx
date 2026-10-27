import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import type { Workspace } from '../../../domain/model';
import type { Theme } from '../../../theme/theme';
import { backupWorkspace, chooseExternalBackupFolder, openExternalBackupFolder, refreshExternalBackup, setExternalBackupEnabled, subscribeExternalBackup, type ExternalBackupStatus } from '../lib/externalBackup';

type Props = { theme: Theme; workspace: Workspace | null; detailsVisible?: boolean };

// Feature: display automatic-backup health and destination controls separately from local save status.
export default function AutomaticBackups({ theme, workspace, detailsVisible = true }: Props) {
  const styles = makeStyles(theme);
  const [status, setStatus] = useState<ExternalBackupStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  useEffect(() => {
    const unsubscribe = subscribeExternalBackup(setStatus);
    void refreshExternalBackup();
    return unsubscribe;
  }, []);

  // Feature: keep folder and manual-backup actions serialized in the UI and report unexpected failures.
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError('');
    try { await action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Could not complete this backup action.'); }
    finally { setBusy(false); }
  };

  // Feature: capture current open work explicitly, including edits whose local save failed.
  const backUpNow = async () => {
    if (workspaceRef.current) await backupWorkspace(workspaceRef.current, true);
    else await refreshExternalBackup();
  };

  const summary = !status?.supported ? 'Automatic backups are available in the desktop app.'
    : status.error ? 'Automatic backup needs attention'
      : !status.enabled ? 'Automatic backups paused'
        : status.lastBackupAt ? 'External backup: ' + new Date(status.lastBackupAt).toLocaleString()
          : 'Automatic backups ready — waiting for a saved workspace';

  return <>
    {/* Feature: keep the backup subscription mounted while routine details collapse; failures always surface. */}
    {(detailsVisible || !!status?.error) && <View style={styles.bar}>
      <Text accessibilityLiveRegion="polite" style={styles.summary}>{summary}</Text>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.button}><Text style={styles.buttonText}>Automatic backups</Text></Pressable>
    </View>}
    {!!status?.error && <Text accessibilityRole="alert" style={styles.warning}>{status.error}</Text>}
    <Modal visible={open} transparent animationType="fade" accessibilityLabel="Automatic external backups" onRequestClose={() => { if (!busy) setOpen(false); }}>
      <View style={styles.overlay}><View style={styles.modal}>
        <View style={styles.header}><Text style={styles.title}>Automatic backups</Text><Pressable accessibilityRole="button" accessibilityLabel="Close automatic backups" disabled={busy} onPress={() => setOpen(false)} style={styles.button}><Text style={styles.buttonText}>Close</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.detail}>{summary}</Text>
          {status?.supported ? <>
            <Text style={styles.detail}>Every saved change updates little-by-little-latest.json outside the app's local storage. Up to 30 older copies are kept, about five minutes apart and before saved checkpoints or workspace restores.</Text>
            <Text style={styles.label}>Backup folder</Text><Text selectable style={styles.path}>{status.folder}</Text>
            <Text style={styles.detail}>Choose an external drive or a cloud-synced folder for protection if this computer is lost. The default Documents folder protects against cleared app data. Cloud uploads depend on your sync app.</Text>
            <Text style={styles.detail}>If a drive is unavailable, local saving continues and automatic backups retry every minute while the workspace is open.</Text>
            {busy && <ActivityIndicator color={theme.accent} />}
            {!!(actionError || status.error) && <Text accessibilityRole="alert" style={styles.warning}>{actionError || status.error}</Text>}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(async () => {
                const previousFolder = status.folder;
                const next = await chooseExternalBackupFolder();
                if (!next.error && next.enabled && next.folder !== previousFolder) await backUpNow();
              }); }} style={styles.button}><Text style={styles.buttonText}>Choose folder</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(openExternalBackupFolder); }} style={styles.button}><Text style={styles.buttonText}>Open folder</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy || !workspace || !status.enabled} onPress={() => { void run(backUpNow); }} style={styles.button}><Text style={styles.buttonText}>Back up now</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(async () => {
                const next = await setExternalBackupEnabled(!status.enabled);
                if (!next.error && next.enabled) await backUpNow();
              }); }} style={styles.button}><Text style={styles.buttonText}>{status.enabled ? 'Pause backups' : 'Resume backups'}</Text></Pressable>
            </View>
            <Text style={styles.detail}>To recover, use Import backup and choose the latest file or a dated copy from this folder. Review the preview, then select Restore workspace. Each file contains the full workspace; local version history is stored separately.</Text>
          </> : <Text style={styles.detail}>Use Download backup in this browser or open the desktop app to save automatic copies to a folder.</Text>}
        </ScrollView>
      </View></View>
    </Modal>
  </>;
}

// Feature: match workspace controls while keeping long folder paths and recovery instructions readable on small screens.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    bar: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surface, borderBottomWidth: 1, borderColor: theme.border },
    summary: { color: theme.muted, fontSize: 12, flexShrink: 1 },
    button: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
    buttonText: { color: theme.accent, fontSize: 14, fontWeight: '600' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', padding: 20, justifyContent: 'center', alignItems: 'center' },
    modal: { width: '100%', maxWidth: 660, maxHeight: '88%', backgroundColor: theme.surface, borderRadius: 18, padding: 24, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    title: { color: theme.text, fontSize: 19, fontWeight: '700', flexShrink: 1 },
    content: { gap: 14, paddingBottom: 12 },
    detail: { color: theme.muted, fontSize: 14, lineHeight: 21 },
    label: { color: theme.text, fontSize: 14, fontWeight: '600' },
    path: { color: theme.text, fontSize: 13, lineHeight: 20 },
    warning: { color: theme.text, backgroundColor: theme.secondarySoft, padding: 12, fontSize: 14, lineHeight: 20 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  });
}
