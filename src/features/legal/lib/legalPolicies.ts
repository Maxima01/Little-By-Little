// Feature: one dated policy source keeps website and offline account disclosures consistent.
export const LEGAL_UPDATED_LABEL = '3 November 2026';
export const LEGAL_OPERATOR = { name: 'Michael Don D. Alaiza', email: 'alaizamichael@gmail.com' } as const;

export type LegalDocumentId = 'terms' | 'privacy';
type LegalSection = { id: string; heading: string; paragraphs: readonly string[]; links?: readonly { label: string; url: string }[] };
type LegalDocument = { id: LegalDocumentId; title: string; summary: string; sections: readonly LegalSection[] };

// Feature: balanced service conditions preserve authorship and statutory rights while defining responsible use.
const terms: LegalDocument = {
  id: 'terms',
  title: 'Terms of Service & Conditions',
  summary: 'Your writing belongs to you. These conditions explain your account, responsible use, and the responsibilities of Little by Little and its users.',
  sections: [
    { id: 'agreement', heading: 'Your agreement with Little by Little', paragraphs: [
      'Little by Little is a writing workspace operated by Michael Don D. Alaiza (the operator, we, or us). These terms govern the application, website, and optional cloud accounts. Contact us at alaizamichael@gmail.com about this agreement, support, privacy, or a complaint.',
      'When creating an account, you must actively accept these terms and separately acknowledge the Privacy Notice. Account registration is optional: you can write and save locally without an account. The Privacy Notice explains processing; acknowledging it does not authorize advertising, sale of your writing, or unrelated uses.',
    ] },
    { id: 'eligibility', heading: 'Account eligibility and security', paragraphs: [
      'Cloud accounts are for people aged 18 or older who can legally enter into this agreement under the laws that apply to them. Do not create an account for another person without authority. If acting for an organization, you must be authorized to bind it.',
      'Provide an email address you control, complete any required verification, protect your credentials, and tell us promptly about suspected unauthorized access. You are responsible for activity you authorize; this does not make you responsible for a security failure caused by us. We will never ask you to email your password or authentication tokens.',
    ] },
    { id: 'ownership', heading: 'You keep ownership of your work', paragraphs: [
      'You retain the rights you hold in manuscripts, characters, world building, notes, research, and other material you create or import. You may export your work and use it commercially. Using Little by Little does not transfer your copyright or give the operator publishing, adaptation, or exclusive rights.',
      'For material you choose to upload, you grant only a non-exclusive, limited permission to store, copy, transmit, and display it as needed to provide your requested cloud saving, restore data, secure the service, and comply with law. Necessary service providers may process it for those purposes. This permission ends when the relevant material is deleted, except for restricted backup copies or retention required by law.',
      'We do not sell or rent your manuscripts or personal data, publish private writing, use it for advertising, or use it to train AI models. A new unrelated purpose requires a separate lawful basis and, where required, a separate choice. These terms do not give a blanket permission to reuse your content.',
    ] },
    { id: 'acceptable-use', heading: 'Responsible and fair use', paragraphs: [
      'Use the service lawfully and respect other people’s copyright, privacy, and other rights. Upload only material you own or have permission or a lawful basis to use. Avoid storing sensitive personal information about real people unless it is necessary and you are entitled to do so.',
      'Do not attempt unauthorized access, impersonation, credential theft, malicious code, security circumvention, harassment, illegal exploitation, or disruption. Do not bypass storage or rate limits, scrape private data, or overload accounts or infrastructure. We may apply proportionate limits to protect service availability.',
      'Fictional themes are not automatically a violation. Copyright exceptions such as fair use depend on the applicable law and circumstances; these terms do not create an exemption or authorize unlawful copying. We do not routinely review private manuscripts for editorial content.',
    ] },
    { id: 'software', heading: 'The application and third-party materials', paragraphs: [
      'The application’s branding, interface, and software remain with their respective owners. We permit you to use the application for your writing while you comply with these terms. This permission does not grant ownership of the product or allow you to misrepresent affiliation. Open-source and third-party license rights remain applicable.',
      'Dictionary and synonym results, imported materials, and external services may carry separate terms and licenses. Check those rights before republishing third-party material. The operator does not guarantee external results or control external providers.',
    ] },
    { id: 'saving', heading: 'Local saving, cloud sync, and backups', paragraphs: [
      'Local saves depend on your device and browser storage. Clearing data, uninstalling, device loss, storage failure, or private browsing can remove work. Keep an exported workspace backup outside the application. Desktop automatic backups, when available and enabled, are ordinary files; manage their folder and access carefully.',
      'Creating an account does not itself upload your local manuscripts. Connecting cloud saves involves reviewing your workspace choice. After connection, enabled sync sends changes to your entire workspace automatically, including manuscripts, characters, world building, and notes. Choosing a workspace can replace the current local or cloud version; review the choice and download a backup first.',
      'Cloud sync is an additional convenience, not a substitute for independent backups. Pausing sync or signing out does not delete stored cloud data or local copies. The Privacy Notice explains retention, security limits, and deletion requests.',
    ] },
    { id: 'availability', heading: 'Availability and future changes', paragraphs: [
      'We aim to provide a useful service with reasonable care and skill. Features may have maintenance periods, outages, storage limits, errors, or compatibility changes. Editing assistance and word suggestions can be inaccurate; you decide what to use in your manuscript.',
      'There is currently no purchase or payment step in account registration. Any future paid service must disclose its price, billing conditions, and cancellation terms before you choose it. Creating an account does not authorize future charges.',
      'We may change or discontinue features for technical, security, legal, or operational reasons. Where reasonably possible, we will give advance notice of material reductions or closure and a reasonable opportunity to export cloud work. Urgent security or legal action may require faster changes.',
    ] },
    { id: 'suspension', heading: 'Suspension, closure, and fair review', paragraphs: [
      'We may restrict or suspend cloud access when reasonably necessary to address a material breach of these terms, unlawful activity, security threats, or a legal requirement. Action should be proportionate. Where lawful and practical, we will explain the reason, allow correction, and provide a way to request review at the contact email.',
      'You can stop using the service at any time. To request account closure and deletion of associated cloud data, email us from your registered address. Export what you want to keep first. We may verify control of the account and retain only information needed for lawful obligations, security, or unresolved claims. Local files and downloaded backups require separate removal.',
    ] },
    { id: 'reports', heading: 'Copyright, privacy, and misuse reports', paragraphs: [
      'Send a report to alaizamichael@gmail.com with your contact details, a description of the issue, the affected account or material if known, and the basis of your rights or concern. Provide only information necessary to investigate; do not email passwords, tokens, or an entire unpublished manuscript unless specifically needed.',
      'We may request clarification, preserve relevant evidence, or restrict access where justified. Reports must be made in good faith. Affected users may request review, subject to legal restrictions and the safety and privacy of others.',
    ] },
    { id: 'liability', heading: 'Responsibilities and limits of liability', paragraphs: [
      'To the extent permitted by applicable law, we do not promise uninterrupted access, perfect editing results, or recovery of every lost local or cloud copy. We are not responsible for losses caused solely by circumstances outside our reasonable control, including a user’s deletion of device storage or unauthorized use of credentials that is not attributable to our failure.',
      'Where law permits, neither party is liable to the other for indirect or unforeseeable loss. Each party remains responsible for direct, reasonably foreseeable harm caused by its own breach of this agreement or unlawful conduct. No automatic penalty, unlimited indemnity, or transfer of the operator’s own fault to the user is imposed by these terms.',
      'Nothing excludes or limits liability for fraud, intentional misconduct, gross negligence, death or personal injury where protected by law, unlawful personal-data processing, or any other liability that cannot legally be excluded. Mandatory consumer remedies and data-protection rights remain available.',
    ] },
    { id: 'disputes', heading: 'Complaints, applicable law, and your rights', paragraphs: [
      'Contact us first if you wish to seek an informal resolution. You may still bring a complaint to a competent regulator or use the courts and remedies available under applicable law. These terms do not require arbitration or waive collective claims, regulator access, or mandatory protections in your country of residence.',
      'The law and competent courts are determined by applicable legal rules. If a provision is unenforceable, the remaining provisions apply only so far as they remain lawful and fair. A failure to enforce a provision immediately is not a waiver of either party’s rights.',
    ] },
    { id: 'updates', heading: 'Updates to these terms', paragraphs: [
      'The date and version identify the terms presented at registration. We will make revised terms available and notify account holders of material changes through the service or their account email before they take effect where practicable. Where renewed agreement is required, we will request it. Changes do not retroactively authorize new uses of previously collected personal data.',
    ] },
  ],
};

// Feature: disclosures reflect verified local storage, whole-workspace sync, external word tools, and practical privacy choices.
const privacy: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Notice & Fair Use of Data',
  summary: 'Write locally without an account. Choose cloud saves when you need them. Here is what is processed, why it is needed, and how you can exercise your privacy choices.',
  sections: [
    { id: 'controller', heading: 'Who is responsible', paragraphs: [
      'Michael Don D. Alaiza operates Little by Little and is responsible for personal data processed to provide its accounts and cloud service. For privacy questions, access or deletion requests, and complaints, email alaizamichael@gmail.com. This notice covers the website, writing workspace, and optional cloud accounts.',
    ] },
    { id: 'device', heading: 'Writing on your device', paragraphs: [
      'Without cloud sync, the workspace stores your manuscripts, story structure, characters, world building, research, notes, revision checkpoints, preferences, and recovery drafts on your device. The browser uses local browser storage, including IndexedDB and localStorage; native builds use application storage. The public website’s sample editor is temporary and is not saved by the application.',
      'Local proofreading, grammar, and writing-analysis features process text on your device. The application does not send your manuscript to an AI model for these checks. Local storage and exported workspace files are not encrypted by the application. Other users or software with access to your device or browser profile may be able to read them.',
      'Desktop automatic backups are enabled by default where available and normally save to Documents/Little by Little Backups. You can change or pause the backup folder. These are ordinary JSON files; a folder managed by another sync provider may send them to that provider under your own settings.',
    ] },
    { id: 'account-data', heading: 'Account and registration data', paragraphs: [
      'If you register or sign in, your email and password are sent to Supabase Auth to create or authenticate your account. Supabase processes account and session identifiers, verification messages, authentication events, and normal connection information such as IP address and browser information. The application stores session tokens on your device to keep you signed in; it does not save your password in the workspace.',
      'Registration includes an acknowledgment of the terms version, privacy-notice version, and the time reported by your device. This records the choice made in the form without collecting an additional identity document, date of birth, or marketing profile. The acknowledgment is not consent to unrelated processing.',
      'If Cloudflare Turnstile is configured, its security widget loads on account forms, including before you submit the form. Cloudflare processes browser, device, network, and challenge information to detect abuse. You can use the local writing desk without opening an account form.',
    ] },
    { id: 'cloud-data', heading: 'What cloud sync sends', paragraphs: [
      'Signing in may read the workspace already associated with your account. For a new cloud connection, signing in does not itself upload local writing. You review the starting workspace choice when connecting cloud saves. Previously linked devices may resume enabled sync after sign-in. Once connected and enabled, saved changes automatically sync the entire portable workspace, including manuscripts, characters, world building, research, notes, and workspace preferences.',
      'Supabase stores the current cloud workspace with its account owner identifier, revision, and save time. Cloud sync is not a separate cloud archive of all local revision checkpoints. Private writing is not publicly listed or published by this feature. Pausing sync stops future synchronization on that device; it does not erase existing cloud copies.',
    ] },
    { id: 'purposes', heading: 'Fair purposes and legal grounds', paragraphs: [
      'We use account and workspace data only to deliver requested accounts and cloud saving, authenticate access, send account or service notices, prevent abuse, resolve a support request, and meet legal obligations. Cloud storage is optional; an account is not necessary to write locally. Support messages are used to respond and resolve the issue raised.',
      'Where data-protection law requires a legal basis, necessary account and sync processing supports the service agreement; proportionate fraud prevention and security support legitimate interests, subject to your rights; and legally required retention or disclosures support legal obligations. Optional processing that requires consent must use a separate, specific choice that can be withdrawn.',
      'We do not sell or rent personal data or manuscripts, use them for targeted advertising, or use your writing to train AI models. The application includes no advertising or analytics tracker. We do not use manuscript content to build a marketing profile or make automated decisions with legal or similarly significant effects.',
    ] },
    { id: 'word-tools', heading: 'Optional online word lookups', paragraphs: [
      'When you request an online definition or synonyms, the selected English word is sent to FreeDictionaryAPI.com, dictionaryapi.dev, or Datamuse as needed for the lookup. These requests send a word rather than the surrounding paragraph or full manuscript, and the receiving provider also receives ordinary connection information. Do not request a lookup for a sensitive name or secret you do not want to send.',
      'These independent providers operate under their own privacy practices. You can avoid the online tools and continue writing and using local analysis. Account registration is not required for a word lookup.',
    ], links: [
      { label: 'FreeDictionaryAPI.com', url: 'https://freedictionaryapi.com/' },
      { label: 'dictionaryapi.dev', url: 'https://dictionaryapi.dev/' },
      { label: 'Datamuse', url: 'https://www.datamuse.com/api/' },
    ] },
    { id: 'sharing', heading: 'Service providers and disclosures', paragraphs: [
      'Supabase processes authentication and cloud storage. Cloudflare processes bot-protection information when enabled. Website and email infrastructure may process connection logs and service messages. We share only information needed for the relevant service. Online word-lookup providers receive only the requested word and connection information described above.',
      'Authorized operator or provider administrators may technically access cloud data. Operator access must be limited to a legitimate support, security, operational, or legal need. We may disclose information where legally required or necessary to protect rights and safety, limiting the scope and notifying you when law permits.',
      'Providers may process information in countries other than yours. The specific cloud region, provider retention settings, and any applicable transfer safeguards depend on the deployment; ask the contact above for details before uploading sensitive information. This notice does not claim a particular residency region or a certification that has not been verified.',
    ], links: [
      { label: 'Supabase privacy policy', url: 'https://supabase.com/privacy' },
      { label: 'Cloudflare Turnstile privacy information', url: 'https://www.cloudflare.com/privacypolicy/' },
    ] },
    { id: 'security', heading: 'Security measures and their limits', paragraphs: [
      'The application’s cloud connection requires HTTPS, and cloud access uses authenticated ownership and session checks. Service limits and conflict checks help protect access and synchronization. Protect your device, use a strong unique password, and avoid sharing a browser profile containing private work.',
      'Cloud saves are not end-to-end encrypted, and the application does not encrypt local saves or backups. No storage or transmission method guarantees absolute security or uninterrupted recovery. If a personal-data breach occurs, the operator must assess it and provide any notifications and remedies required by applicable law.',
    ] },
    { id: 'retention', heading: 'Retention and deletion', paragraphs: [
      'Local writing remains until you remove it or the device or browser removes its storage. Revision history is bounded by storage limits and can retain older versions after a story is deleted. Desktop backups retain a latest copy and up to 30 historical copies; downloaded exports and backups remain wherever you saved them until you delete them.',
      'Cloud account and current workspace data are retained while the account provides the requested service, unless you request deletion or a lawful reason requires earlier removal. Signing out, pausing sync, or deleting the application is not an account-deletion request. Deleting a story from a connected workspace syncs the new state, but older device copies and provider backups may still exist.',
      'To close an account and request cloud deletion, email us from the registered address. After appropriate verification, we will delete or anonymize data that is no longer needed, subject to applicable legal duties and necessary security or dispute records. Provider backup copies may remain until their normal retention cycle expires; restored data must remain subject to your deletion request. Ask us for the deployment’s current retention details. We do not promise an unverified fixed erasure deadline.',
    ] },
    { id: 'rights', heading: 'Your choices and privacy rights', paragraphs: [
      'You can write without an account, decline cloud sync, pause sync, sign out, export your manuscript or workspace, and manage local storage and desktop backups. Export before clearing storage or requesting deletion. On shared devices, signing out alone does not remove locally stored manuscripts.',
      'Depending on the law that applies, you may request access, a copy or portability, correction, deletion, restriction, or withdrawal of consent. You may object to processing based on legitimate interests, including security processing, on grounds relating to your situation; we will assess the request and explain any lawful reason processing must continue. You may complain to the competent data-protection authority or seek a legal remedy.',
      'Send requests to alaizamichael@gmail.com. We may ask for proportionate evidence that you control the account, and will respond within applicable legal deadlines. Do not send passwords, authentication tokens, or unnecessary sensitive documents. Declining optional processing does not remove your right to use local writing features; some cloud functions require the account information needed to provide them.',
    ] },
    { id: 'children', heading: 'Children and account eligibility', paragraphs: [
      'Cloud account registration is intended for adults aged 18 or older who can enter into the service agreement. We do not knowingly seek cloud accounts from children. If you believe a child has provided personal data through an account, contact us so we can review it and take appropriate action. The account form does not collect a date of birth or identity document.',
    ] },
    { id: 'notice-updates', heading: 'Changes to this notice', paragraphs: [
      'We will date revised notices and provide notice of material changes through the service or account email as appropriate. We will explain a new purpose before using data for it and obtain a separate permission where required. Acknowledging a revised notice does not waive any privacy rights.',
    ] },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = { terms, privacy };
