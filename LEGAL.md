# Little by Little legal notices

<!-- Feature: document the policy source, signup acknowledgments, and operator responsibilities for maintaining accurate notices. -->

The public documents are available at `/terms` and `/privacy`, including on static hosts after `npm run build:web`. The writing desk shows the same documents offline under **Cloud saves → Terms & conditions / Privacy & data use**, including when cloud accounts are unavailable.

The operator is **Michael Don D. Alaiza**, with privacy and support requests directed to **alaizamichael@gmail.com**. The current documents are dated **3 November 2026**, version `2026-11-03`. No operating country, governing jurisdiction, hosting region, or company registration has been assumed.

## Maintaining the documents

`src/features/legal/lib/legalPolicies.ts` contains the shared terms and privacy notice. `src/features/legal/lib/policyConsent.ts` contains the version. Preserve a dated copy of the previously published text before changing a version. Review the notice whenever storage, providers, training, analytics, billing, retention, eligibility, or account handling changes. Material changes require the notice and, where applicable, renewed agreement described in the terms; the present implementation captures agreement at new account registration, not a re-consent flow for existing users.

The terms make cloud accounts available to adults aged 18 or older who can legally enter into the agreement. The registration checkbox includes that declaration; this is not an identity or age-verification system.

## Signup acknowledgment

Both website and desk registration require an affirmative terms agreement and a separate privacy acknowledgment. Neither is preselected. The shared signup function rejects missing or partial acknowledgment before contacting the authentication provider. Privacy acknowledgment is not bundled consent to advertising or unrelated processing. Sign-in and local writing remain available independently.

Supabase receives `options.data.legal_acceptance` with `terms_version`, `privacy_version`, `terms_accepted`, `privacy_acknowledged`, and a device-reported ISO `accepted_at`. CAPTCHA remains in the same signup options when configured. This metadata is user-editable, and its time is client-supplied: it is an acknowledgment record, not an immutable or independently verified audit trail. Never use it for access control. Direct requests to a public authentication API can bypass the application form; no server-side signup hook or database migration is installed by this change.

If independently verifiable consent evidence is required for the deployment, implement server-side validation and an append-only, access-controlled receipt with a server timestamp and retained policy version. Do not collect extra personal data merely to strengthen a receipt. Existing accounts are not silently treated as having accepted new terms.

## Operational responsibilities

The documents describe actual application behavior, including whole-workspace cloud sync, local storage without application-level encryption, optional external word lookups, default desktop backups, and the absence of end-to-end encryption. A policy cannot by itself guarantee security or legal compliance.

Before public release, the operator should confirm the operating jurisdiction, any required business address or representative, host and provider agreements, processing regions and transfer safeguards, and retention schedules. Confirm that the published commitments can be fulfilled and obtain legal review for the countries being served. The public notice uses retention criteria and a contact route rather than an unverified number of days or residency claim.

Monitor the published email for access, correction, objection, deletion, copyright, and complaint requests. Verify account control proportionately and meet applicable legal response deadlines. Account deletion currently requires an operator action: there is no self-service account-deletion screen. The deployed schema cascades an administrator's Auth-user deletion to its cloud workspace. Follow the deployment's session-revocation procedure, applicable retention duties, and backup handling; do not imply that sign-out or paused sync deletes a cloud copy. Local exports and backups require separate removal by their holder.

Limit administrator access to legitimate needs, maintain incident-response procedures, and deliver required breach notifications. The current code does not add a support inbox, automatic deletion workflow, policy-change email sender, or breach-notification system. Those are operator responsibilities promised in the notices rather than implemented automation.

## Drafting references

The wording is original and grounded in the repository's data flows. The following primary guidance informed transparency, retention criteria, and preservation of mandatory rights; these references do not mean every listed law applies to this operator:

- [FTC privacy and security guidance](https://www.ftc.gov/business-guidance/privacy-security): published privacy promises must match practice.
- [ICO guidance on privacy information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/): describe purposes, recipients, rights, and retention periods or criteria.
- [European Commission consumer-contract guidance](https://europa.eu/youreurope/business/selling-in-eu/consumer-contracts-guarantees/consumer-contracts/index_en.htm): standard terms must be fair and preserve mandatory remedies.
- [Supabase JavaScript signup reference](https://supabase.com/docs/reference/javascript/auth-signup): provider signup behavior and additional user metadata.
