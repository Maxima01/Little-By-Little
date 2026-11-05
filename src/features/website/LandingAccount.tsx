import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import CloudChallenge from '../workspace/components/CloudChallenge';
import { cloudChallengeRequired } from '../workspace/lib/cloudChallenge';
import { signInCloudAccount, signUpCloudAccount, validateCloudCredentials, CLOUD_EMAIL_MAX_LENGTH, CLOUD_PASSWORD_MAX_LENGTH, CLOUD_PASSWORD_MIN_LENGTH, CLOUD_REGISTRATION_NOTICE } from '../workspace/lib/cloudAuth';
import { cloudRegistration, supabase } from '../workspace/lib/supabase';

export type AccountMode = 'signin' | 'register';
type Props = { mode: AccountMode; onModeChange: (mode: AccountMode) => void };

// Feature: optional landing-page accounts connect cloud saves while the free local desk stays one click away.
export default function LandingAccount({ mode: requestedMode, onModeChange }: Props) {
  const [email, setEmail] = useState('');
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  // Feature: keep the active form tied to its request even when header links select another action.
  const [pendingMode, setPendingMode] = useState<AccountMode | null>(null);
  const busy = pendingMode !== null;
  const mode = pendingMode ?? requestedMode;
  const isSignedIn = accountEmail !== null;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [challengeReset, setChallengeReset] = useState(0);
  // Feature: new accounts require separate, unchecked terms acceptance and privacy acknowledgment.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);

  // Feature: show an existing account without fetching or modifying any cloud manuscript from the landing page.
  useEffect(() => {
    mounted.current = true;
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (mounted.current) setAccountEmail(session?.user.email ?? null);
    }).data.subscription;
    return () => { mounted.current = false; subscription?.unsubscribe(); };
  }, []);

  // Feature: clear sensitive form state before a different account action or session is shown.
  useLayoutEffect(() => {
    if (passwordInput.current) passwordInput.current.value = '';
    if (isSignedIn) { setEmail(''); setNotice(''); }
    setError(''); setCaptchaToken('');
    setTermsAccepted(false); setPrivacyAcknowledged(false);
    setChallengeReset((value) => value + 1);
  }, [mode, isSignedIn]);

  // Feature: submit one account request at a time, clear passwords, and enter only the fixed local writing route.
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || !supabase || (cloudChallengeRequired && !captchaToken)) return;
    if (mode === 'register' && (!termsAccepted || !privacyAcknowledged)) {
      setError('Agree to the Terms of Service and acknowledge the Privacy Notice before creating an account.');
      return;
    }
    // Feature: read the submitted controls so passwords filled by a password manager are captured correctly.
    const fields = new FormData(event.currentTarget);
    const submittedEmail = fields.get('email');
    const submittedPassword = fields.get('password');
    if (typeof submittedEmail !== 'string' || typeof submittedPassword !== 'string') return;
    try { validateCloudCredentials(submittedEmail, submittedPassword, mode === 'register'); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Check your email address and password.');
      return;
    }
    const submittedToken = captchaToken || undefined;
    submitting.current = true; setPendingMode(mode); setError(''); setNotice(''); setCaptchaToken('');
    setEmail(submittedEmail);
    if (passwordInput.current) passwordInput.current.value = '';
    try {
      if (mode === 'register') {
        await signUpCloudAccount(cloudRegistration, submittedEmail, submittedPassword, { termsAccepted, privacyAcknowledged }, submittedToken);
        if (mounted.current) {
          setTermsAccepted(false);
          setPrivacyAcknowledged(false);
          setNotice(CLOUD_REGISTRATION_NOTICE);
        }
        return;
      }
      await signInCloudAccount(supabase, submittedEmail, submittedPassword, submittedToken);
      if (mounted.current) window.location.assign('/app');
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not connect. Please try again.');
    } finally {
      submitting.current = false;
      if (mounted.current) { setPendingMode(null); setCaptchaToken(''); setChallengeReset((value) => value + 1); }
    }
  };

  return <section className="site-account" id="account" aria-labelledby="account-title">
    <div className="account-copy">
      <h2 id="account-title">Write now.<br />Save later.</h2>
      <p>Create a story for free, without an account. Your writing saves in this browser as you go.</p>
      <p>When you want cloud saves, sign in or register now. You can also do this later from Cloud saves at the writing desk.</p>
      <a className="site-text-link" href="/app">Continue without an account</a>
      <p className="account-note">Keep a downloaded backup too. Clearing browser data can remove stories saved on this device.</p>
    </div>
    <div className="account-panel" data-ui>
      {accountEmail ? <>
        <h3>Ready for your next page</h3>
        <p className="account-identity">Signed in as {accountEmail}</p>
        <p>Open the writing desk to review your workspace and connect cloud saves.</p>
        <a className="site-action" href="/app">Open writing desk</a>
      </> : <>
        <div className="account-switch" role="group" aria-label="Cloud account action">
          <button type="button" aria-pressed={mode === 'signin'} disabled={busy} onClick={() => onModeChange('signin')}>Sign in</button>
          <button type="button" aria-pressed={mode === 'register'} disabled={busy} onClick={() => onModeChange('register')}>Register</button>
        </div>
        <h3>{mode === 'register' ? 'Register for cloud saves' : 'Sign in to cloud saves'}</h3>
        {/* Feature: a native fallback uses POST so credentials never become URL query parameters. */}
        {!supabase ? <><p>Cloud accounts are not available in this build. You can still write for free and save on this device.</p><a className="site-action" href="/app">Create a story for free</a></> : <form method="post" onSubmit={(event) => { void submit(event); }} aria-busy={busy}>
          <p id="account-help">Signing in keeps your local stories. You choose which workspace to sync at the writing desk.</p>
          <fieldset disabled={busy}>
            <legend className="site-sr-only">Cloud account credentials</legend>
            <label htmlFor="account-email">Email address</label>
            <input id="account-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={CLOUD_EMAIL_MAX_LENGTH} required value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby="account-help" />
            <label htmlFor="account-password">{mode === 'register' ? `Password · at least ${CLOUD_PASSWORD_MIN_LENGTH} characters` : 'Password'}</label>
            <input ref={passwordInput} id="account-password" name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? CLOUD_PASSWORD_MIN_LENGTH : 1} maxLength={CLOUD_PASSWORD_MAX_LENGTH} required />
            {mode === 'register' && <div className="account-consent">
              <p>Your writing stays yours. Read how optional cloud saves use and protect your data before creating an account.</p>
              <label className="account-consent-choice" htmlFor="account-terms"><input id="account-terms" name="terms" type="checkbox" required checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span>I am at least 18, can enter into this agreement, and agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service (opens in a new tab)</a>.</span></label>
              <label className="account-consent-choice" htmlFor="account-privacy"><input id="account-privacy" name="privacy" type="checkbox" required checked={privacyAcknowledged} onChange={(event) => setPrivacyAcknowledged(event.target.checked)} /><span>I have read and acknowledge the <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Notice (opens in a new tab)</a>.</span></label>
            </div>}
            <CloudChallenge onToken={setCaptchaToken} resetKey={challengeReset} />
            <button className="site-action" type="submit" disabled={busy || (cloudChallengeRequired && !captchaToken) || (mode === 'register' && (!termsAccepted || !privacyAcknowledged))}>{busy ? 'Connecting…' : mode === 'register' ? 'Register' : 'Sign in'}</button>
          </fieldset>
          {!!error && <p className="account-error" role="alert">{error}</p>}
          {!!notice && <p className="account-notice" role="status">{notice}</p>}
        </form>}
      </>}
      <nav className="account-legal-links" aria-label="Account policies"><a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a><a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Notice</a></nav>
    </div>
  </section>;
}
