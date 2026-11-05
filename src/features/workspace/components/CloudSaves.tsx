import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Pressable from '../../../components/AccessiblePressable';
import type { Theme } from '../../../theme/theme';
import type { CloudSyncController } from '../hooks/useCloudSync';
import { validateCloudCredentials, CLOUD_EMAIL_MAX_LENGTH, CLOUD_PASSWORD_MAX_LENGTH, CLOUD_PASSWORD_MIN_LENGTH, CLOUD_REGISTRATION_NOTICE } from '../lib/cloudAuth';
import CloudChallenge from './CloudChallenge';
import { cloudChallengeRequired } from '../lib/cloudChallenge';
import AccountPolicies from '../../legal/components/AccountPolicies';
import type { AccountPolicyAcceptance } from '../../legal/lib/policyConsent';

type Props = { theme: Theme; cloud: CloudSyncController; detailsVisible: boolean };
const noAcceptance: AccountPolicyAcceptance = { termsAccepted: false, privacyAcknowledged: false };

// Feature: cloud accounts, sync health and explicit workspace choices live beside the existing backup controls.
export default function CloudSaves({ theme, cloud, detailsVisible }: Props) {
  const styles = makeStyles(theme);
  const [expanded, setExpanded] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  // Feature: terms agreement and privacy acknowledgment are separate choices and never preselected.
  const [acceptance, setAcceptance] = useState(noAcceptance);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [challengeReset, setChallengeReset] = useState(0);
  const [acting, setActing] = useState(false);
  const actingRef = useRef(false);
  const passwordRef = useRef<TextInput>(null);
  const busy = cloud.busy || acting;
  const showDetails = expanded || detailsVisible || !!cloud.conflict;
  const showAccountForm = showDetails && cloud.configured && !cloud.email;
  const error = actionError || cloud.error;
  const remote = cloud.conflict?.remote;
  const { height } = useWindowDimensions();
  const detailsRef = useRef<View>(null);
  const [detailsTop, setDetailsTop] = useState(130);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  // Feature: closing the form or signing in discards unsent credentials, verification, and policy choices.
  useLayoutEffect(() => {
    if (showAccountForm) return;
    setEmail(''); setPassword(''); setAcceptance(noAcceptance); setCaptchaToken('');
    if (cloud.email) setCreatingAccount(false);
  }, [showAccountForm, cloud.email]);
  // Feature: measure all preceding toolbar rows so cloud actions remain scrollable in short windows.
  const measureDetails = () => {
    detailsRef.current?.measureInWindow((_x, y) => setDetailsTop(y));
  };
  useEffect(() => { measureDetails(); }, [height, detailsVisible, showDetails, !!error]);
  // Feature: native keyboards reduce the usable account form area while keeping submit controls reachable.
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) => setKeyboardTop(event.endCoordinates.screenY));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(null));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  const detailsHeight = Math.max(80, Math.min(560, Math.min(height, keyboardTop ?? height) - detailsTop - 12));

  // Feature: serialize account and conflict actions, including rapid presses before React updates disabled controls.
  const run = async (action: () => Promise<void>) => {
    if (actingRef.current || cloud.busy) return;
    actingRef.current = true;
    setActing(true); setActionError(''); setNotice('');
    try { await action(); }
    catch (failure) { setActionError(failure instanceof Error ? failure.message : 'Could not complete this cloud action. Please try again.'); }
    finally { actingRef.current = false; setActing(false); }
  };

  // Feature: use password authentication on desktop and mobile without a redirect, and clear submitted credentials.
  const submitAccount = () => {
    if (!showAccountForm || busy || actingRef.current) return;
    // Feature: keyboard submission follows the same consent requirement as the disabled registration button.
    if (creatingAccount && (!acceptance.termsAccepted || !acceptance.privacyAcknowledged)) {
      setActionError('Agree to the Terms of Service and acknowledge the Privacy Notice before creating an account.');
      return;
    }
    if (cloudChallengeRequired && !captchaToken) {
      setActionError('Complete the security check before signing in or registering.');
      return;
    }
    let submittedEmail: string;
    try { submittedEmail = validateCloudCredentials(email, password, creatingAccount); }
    catch (failure) {
      setActionError(failure instanceof Error ? failure.message : 'Check your email address and password.');
      return;
    }
    const submittedPassword = password;
    const submittedToken = captchaToken || undefined;
    void run(async () => {
      // Feature: CAPTCHA tokens are single use, so every attempted account request requires a fresh challenge.
      setPassword(''); setCaptchaToken('');
      try {
        if (creatingAccount) {
          await cloud.signUp(submittedEmail, submittedPassword, acceptance, submittedToken);
          setNotice(CLOUD_REGISTRATION_NOTICE);
          setCreatingAccount(false);
          setAcceptance(noAcceptance);
        } else await cloud.signIn(submittedEmail, submittedPassword, submittedToken);
      } finally { setCaptchaToken(''); setChallengeReset((value) => value + 1); }
    });
  };

  // Feature: a pending account request locks the mode and each new mode starts with a fresh challenge.
  const switchAccountMode = () => {
    if (busy || actingRef.current) return;
    setCreatingAccount(!creatingAccount);
    setAcceptance(noAcceptance); setPassword(''); setActionError(''); setNotice('');
    setCaptchaToken(''); setChallengeReset((value) => value + 1);
  };

  return <View style={styles.container} onLayout={measureDetails}>
    <View style={styles.bar}>
      <View style={styles.summary}>
        <Text accessibilityLiveRegion="polite" style={styles.status}>{cloud.status}</Text>
        {!!cloud.lastSyncedAt && !showDetails && <Text style={styles.detail}>Last synced {new Date(cloud.lastSyncedAt).toLocaleTimeString()}</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cloud saves" accessibilityState={{ expanded: showDetails }} onPress={() => setExpanded(!expanded)} style={[styles.button, showDetails && styles.selected]}>
        <Text style={styles.buttonText}>Cloud saves</Text>
      </Pressable>
    </View>
    {!!error && <Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
    {showDetails && <View ref={detailsRef} onLayout={measureDetails} collapsable={false}><ScrollView style={{ maxHeight: detailsHeight }} contentContainerStyle={styles.details} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      {!cloud.configured ? <Text style={styles.detail}>Cloud saves are not configured for this build. Your workspace continues to save on this device.</Text> : cloud.email ? <>
        <Text selectable style={styles.account}>Signed in as {cloud.email}</Text>
        <Text style={styles.detail}>Cloud sync includes your entire workspace: stories, chapters, characters, world building and notes. Keep writing offline; saved changes sync when a connection is available.</Text>
        {cloud.conflict ? <View style={styles.choice}>
          <Text style={styles.heading}>{cloud.conflict.initial ? 'Choose your starting workspace' : 'Both workspaces need review'}</Text>
          <Text style={styles.detail}>{remote
            ? 'Choose which entire workspace to use. Choosing cloud replaces this device’s workspace and preserves the previous version in Version history. Choosing this device replaces the cloud workspace used by your other devices.'
            : 'This account has no cloud workspace. Start cloud sync to upload this device’s entire workspace.'}</Text>
          {!!remote && <View style={styles.preview}>
            <Text style={styles.label}>Cloud workspace</Text>
            <Text style={styles.detail}>{remote.workspace.stories.length} {remote.workspace.stories.length === 1 ? 'story' : 'stories'} · Saved {new Date(remote.savedAt).toLocaleString()}</Text>
            <Text numberOfLines={3} style={styles.detail}>{remote.workspace.stories.map((story) => story.title || 'Untitled story').join(' · ') || 'Empty story library'}</Text>
          </View>}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(() => cloud.resolve('local')); }} style={styles.primary}>
              <Text style={styles.primaryText}>{remote ? 'Use this device’s workspace' : 'Start cloud sync'}</Text>
            </Pressable>
            {!!remote && <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(() => cloud.resolve('cloud')); }} style={styles.button}>
              <Text style={styles.buttonText}>Use cloud workspace</Text>
            </Pressable>}
          </View>
          {!!remote && <Text style={styles.detail}>Use Workspace → Download backup to keep an extra copy before choosing.</Text>}
        </View> : <>
          {!!cloud.lastSyncedAt && <Text style={styles.detail}>Last synced {new Date(cloud.lastSyncedAt).toLocaleString()}</Text>}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy || !cloud.enabled} onPress={() => { void run(cloud.syncNow); }} style={styles.button}><Text style={styles.buttonText}>Sync now</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(() => cloud.setEnabled(!cloud.enabled)); }} style={styles.button}><Text style={styles.buttonText}>{cloud.enabled ? 'Pause sync' : 'Resume sync'}</Text></Pressable>
          </View>
        </>}
        <View style={styles.accountActions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(cloud.signOut); }} style={styles.button}><Text style={styles.buttonText}>Sign out</Text></Pressable>
          <Text style={styles.detail}>Your stories stay on this device after signing out.</Text>
        </View>
      </> : <>
        <Text style={styles.heading}>{creatingAccount ? 'Create a cloud account' : 'Sign in to cloud saves'}</Text>
        <Text style={styles.detail}>Keep writing for free on this device. Sign in or register whenever you want cloud saves; your local stories stay here until you choose to start syncing.</Text>
        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email address</Text>
            <TextInput accessibilityLabel="Cloud account email address" value={email} onChangeText={setEmail} maxLength={CLOUD_EMAIL_MAX_LENGTH} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} editable={!busy} placeholder="you@example.com" placeholderTextColor={theme.muted} style={styles.input} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{creatingAccount ? `Password · at least ${CLOUD_PASSWORD_MIN_LENGTH} characters` : 'Password'}</Text>
            <TextInput ref={passwordRef} accessibilityLabel="Cloud account password" value={password} onChangeText={setPassword} maxLength={CLOUD_PASSWORD_MAX_LENGTH} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={creatingAccount ? 'new-password' : 'current-password'} textContentType={creatingAccount ? 'newPassword' : 'password'} returnKeyType="go" onSubmitEditing={submitAccount} editable={!busy} placeholder="Enter your password" placeholderTextColor={theme.muted} style={styles.input} />
          </View>
          <AccountPolicies theme={theme} acceptance={creatingAccount ? acceptance : undefined} onChange={setAcceptance} disabled={busy} />
          <CloudChallenge onToken={setCaptchaToken} resetKey={challengeReset} color={theme.muted} />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy || (creatingAccount && (!acceptance.termsAccepted || !acceptance.privacyAcknowledged)) || (cloudChallengeRequired && !captchaToken)} onPress={submitAccount} style={styles.primary}><Text style={styles.primaryText}>{creatingAccount ? 'Create account' : 'Sign in'}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={switchAccountMode} style={styles.button}><Text style={styles.buttonText}>{creatingAccount ? 'Use an existing account' : 'Create an account'}</Text></Pressable>
          </View>
        </View>
      </>}
      {(!cloud.configured || !!cloud.email) && <AccountPolicies theme={theme} />}
      {busy && <View accessibilityLiveRegion="polite" style={styles.progress}><ActivityIndicator color={theme.accent} size="small" /><Text style={styles.detail}>Working…</Text></View>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    </ScrollView></View>}
  </View>;
}

// Feature: inherit workspace colors and touch targets, with wrapping controls and fluid account fields on narrow windows.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flexShrink: 0, borderBottomWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
    bar: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
    summary: { flex: 1, minWidth: 140, gap: 3 },
    status: { color: theme.muted, fontSize: 12, lineHeight: 18 },
    detail: { color: theme.muted, fontSize: 13, lineHeight: 20, flexShrink: 1 },
    details: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 12 },
    heading: { color: theme.text, fontSize: 16, lineHeight: 23, fontWeight: '700' },
    account: { color: theme.text, fontSize: 14, lineHeight: 21, fontWeight: '600' },
    label: { color: theme.text, fontSize: 13, lineHeight: 20, fontWeight: '600' },
    form: { maxWidth: 540, width: '100%', gap: 12 },
    field: { gap: 5 },
    input: { minHeight: 44, borderWidth: 1, borderColor: theme.muted, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.text, backgroundColor: theme.background },
    button: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, maxWidth: '100%' },
    selected: { backgroundColor: theme.accentSoft },
    buttonText: { color: theme.accent, fontSize: 14, fontWeight: '600' },
    primary: { minHeight: 44, justifyContent: 'center', backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10, maxWidth: '100%' },
    primaryText: { color: theme.mode === 'dark' ? '#201B2A' : '#FFFFFF', fontSize: 14, fontWeight: '700' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    accountActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingTop: 4 },
    choice: { padding: 14, borderRadius: 8, backgroundColor: theme.accentPaper, gap: 12 },
    preview: { gap: 4 },
    warning: { color: theme.text, backgroundColor: theme.secondarySoft, padding: 12, fontSize: 14, lineHeight: 20 },
    notice: { color: theme.text, backgroundColor: theme.accentSoft, padding: 12, fontSize: 14, lineHeight: 20 },
    progress: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  });
}
