// Feature: one version identifies the terms and privacy notice shown before account registration.
export const LEGAL_VERSION = '2026-11-06';

export type AccountPolicyAcceptance = { termsAccepted: boolean; privacyAcknowledged: boolean };

// Feature: validate explicit acknowledgments and record their policy versions without collecting extra personal data.
// This client-supplied, user-editable metadata is an acknowledgment, not authorization or an immutable audit trail.
export function createAccountPolicyRecord(acceptance: AccountPolicyAcceptance) {
  if (acceptance?.termsAccepted !== true || acceptance?.privacyAcknowledged !== true) {
    throw new Error('Agree to the Terms of Service and acknowledge the Privacy Notice before creating an account.');
  }
  return {
    terms_version: LEGAL_VERSION,
    privacy_version: LEGAL_VERSION,
    terms_accepted: true,
    privacy_acknowledged: true,
    accepted_at: new Date().toISOString(),
  };
}
