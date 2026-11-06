// Feature: Philippine-law policy revision preserves statutory remedies and discloses verified processing without claiming compliance certification.
export const LEGAL_UPDATED_LABEL = '6 November 2026';
export const LEGAL_OPERATOR = { name: 'Michael Don D. Alaiza', email: 'alaizamichael@gmail.com' } as const;

export type LegalDocumentId = 'terms' | 'privacy';
type LegalSection = { id: string; heading: string; paragraphs: readonly string[]; links?: readonly { label: string; url: string }[] };
type LegalDocument = { id: LegalDocumentId; title: string; summary: string; sections: readonly LegalSection[] };

// Feature: website and offline policy readers share the same complete terms and privacy notice.
export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  "terms": {
    "id": "terms",
    "title": "Terms of Service & Conditions",
    "summary": "The conditions for using Little by Little, operated in the Philippines by Michael Don D. Alaiza. Your writing remains yours, and your rights under applicable law remain protected.",
    "sections": [
      {
        "id": "agreement",
        "heading": "Operator, scope, and agreement",
        "paragraphs": [
          "Little by Little is operated by Michael Don D. Alaiza in the Philippines. Contact alaizamichael@gmail.com for service questions, privacy requests, complaints, or notices. These terms cover the website, writing application, and optional cloud account.",
          "You accept these terms when you select the agreement checkbox and submit account registration. A separate acknowledgment confirms that the Privacy Notice was presented to you; it is not permission for every possible use of personal data. Local writing remains available without registration. These terms do not treat earlier account holders as having accepted a new version merely because it has been published."
        ]
      },
      {
        "id": "eligibility",
        "heading": "Eligibility and account responsibilities",
        "paragraphs": [
          "Cloud accounts are available to adults aged 18 or older who have legal capacity to enter into this agreement. If you represent an organization, you must have authority to act for it. Supply an email address you control and complete the required verification.",
          "Keep credentials private, use a strong unique password, and report suspected unauthorized access promptly. You are responsible for actions you authorize. You are not automatically responsible for every action performed through a compromised account. We will not ask you to email passwords, session tokens, or recovery codes."
        ]
      },
      {
        "id": "ownership",
        "heading": "Your writing and the limited service permission",
        "paragraphs": [
          "You retain your rights in your manuscripts, story ideas, character profiles, world building, notes, and imported material. You may export and commercially use material to which you have the necessary rights. Using the service does not assign copyright to the operator.",
          "For content you send to cloud saves, you authorize only the copying, storage, transmission, and display reasonably needed to provide the features you request and maintain their security. Necessary providers may perform those operations for the service. This permission does not authorize publication, advertising, AI training, sale, or licensing of your writing to others.",
          "The permission ends when the relevant content is removed from our systems, except for limited retention required by law or restricted backup copies awaiting deletion. It does not permit further commercial use of retained copies. Personal-data processing remains subject to a lawful basis independently of this content permission."
        ]
      },
      {
        "id": "acceptable-use",
        "heading": "Lawful and responsible use",
        "paragraphs": [
          "Use Little by Little for lawful purposes. Respect copyright, privacy, confidentiality, and other rights. Only upload material you are entitled to use. Do not use another person’s identity, access private accounts without authority, distribute malicious code, interfere with the service, or evade reasonable security and usage limits.",
          "Fictional subject matter is not by itself a breach of these terms. Copyright exceptions, including fair use, depend on the applicable law and facts. The phrase fair use of data does not create a copyright exception or replace a lawful basis for processing personal information.",
          "The cloud workspace is not designed as a repository for identity documents, medical records, financial credentials, privileged communications, or sensitive personal information about real people. Do not upload those categories through the ordinary cloud-writing feature. Contact us if such information was uploaded inadvertently so we can help address it."
        ]
      },
      {
        "id": "software",
        "heading": "Application rights and outside services",
        "paragraphs": [
          "The operator and respective rights holders retain rights in the application, branding, and third-party materials. You receive permission to use the application for its intended functions under these terms. Open-source licenses and rights granted by law remain effective.",
          "Online dictionary and synonym providers have their own terms and privacy practices. Check permissions before republishing their material. We remain responsible for our own selection and use of providers where required by law; linking to an external service does not transfer that responsibility to you."
        ]
      },
      {
        "id": "saving",
        "heading": "Saving, synchronization, and copies",
        "paragraphs": [
          "Local work is stored on your device. Browser-data removal, uninstallation, device failure, or loss can remove it. Export a workspace backup for independent recovery. Desktop automatic backups, where available, start enabled and normally use Documents/Little by Little Backups; you can change or pause that folder.",
          "New cloud connections require a workspace choice before uploading different local work. Once connected, enabled sync sends the whole portable workspace and subsequent saved changes. A previously linked device may resume sync after sign-in. Choosing a local or cloud workspace can replace the other version; read the choice before proceeding.",
          "Sign-out, paused sync, and uninstallation do not delete your cloud account. Local copies, exports, and backups remain separately. These explanations help you manage copies; they do not waive our duties to protect data or provide remedies for our own failures."
        ]
      },
      {
        "id": "availability",
        "heading": "Service operation and charges",
        "paragraphs": [
          "We undertake to provide the service with the care required by applicable law. Software suggestions can be incorrect, and availability may be affected by maintenance, connectivity, or faults. You remain the editor of your work; writing assistance is not professional advice.",
          "Account registration currently has no payment step. We will not charge you merely because you registered. Any future paid offering must present its price and applicable payment, cancellation, and refund conditions before you choose to purchase it.",
          "We may make justified operational, legal, or security changes. For a material reduction or planned closure, we will give reasonable advance notice where practicable and an opportunity to retrieve work. Urgent protective action may take effect sooner. Applicable remedies remain available."
        ]
      },
      {
        "id": "suspension",
        "heading": "Restrictions and account closure",
        "paragraphs": [
          "We may restrict cloud access where reasonably necessary to address a material breach, a security threat, unlawful conduct, or a lawful order. Restrictions must be proportionate. Unless prohibited or unsafe, we will explain the reason and allow you to request review at alaizamichael@gmail.com.",
          "You can stop using the application and request account closure at any time. Email the operator to request deletion of account and cloud data. We may verify account control proportionately. Export anything you wish to keep first. A suspension does not remove your right to request access, deletion, or a review of retained data."
        ]
      },
      {
        "id": "reports",
        "heading": "Complaints and rights-holder reports",
        "paragraphs": [
          "Email the operator with the issue, your contact details, and enough information to identify the affected material or account. For an intellectual-property complaint, explain the rights you hold and the alleged infringement. Send only evidence needed for the report, not your entire private manuscript or login credentials.",
          "We will assess reports fairly, request clarification when needed, and take justified action. Users affected by a restriction may seek review. Evidence may be preserved only for a legitimate and lawful purpose, with appropriate access limits."
        ]
      },
      {
        "id": "liability",
        "heading": "Responsibility and legal remedies",
        "paragraphs": [
          "Each party remains responsible for its own acts and omissions under Philippine law. These terms do not waive claims for fraud, negligence, bad faith, unlawful processing, breach of statutory duties, or other liability imposed by applicable law.",
          "Availability limits, backup advice, and security disclosures are explanations of operation, not releases from liability. No blanket exclusion of damages, automatic indemnity, or compulsory penalty is imposed on users. Whether a loss is recoverable and the amount of any remedy are determined by applicable law and the relevant facts."
        ]
      },
      {
        "id": "disputes",
        "heading": "Philippine law and dispute resolution",
        "paragraphs": [
          "Philippine law governs these terms, subject to mandatory protections that otherwise apply. Disputes may be brought before courts or authorities with jurisdiction under applicable procedural law. No exclusive distant venue or mandatory arbitration is imposed.",
          "You may contact us to seek resolution, but these terms do not make that a condition of exercising a statutory remedy. You may approach the National Privacy Commission for privacy matters and other competent authorities for matters within their jurisdiction.",
          "If a provision is unlawful or unenforceable, it will not override the law. The remaining provisions continue only to the extent they can lawfully operate. A delay in asserting a right does not by itself waive it."
        ]
      },
      {
        "id": "updates",
        "heading": "Changes and version history",
        "paragraphs": [
          "This version is dated 6 November 2026. Material amendments will be communicated through the service or the account email with reasonable notice where practicable. When agreement is required, we will obtain it before applying new contractual conditions to you. Mere publication does not create retrospective consent.",
          "A change cannot retrospectively authorize an unrelated use of personal data. The Privacy Notice explains how changes in processing will be communicated. You may request the version relevant to your account from the operator."
        ]
      }
    ]
  },
  "privacy": {
    "id": "privacy",
    "title": "Privacy Notice & Fair Use of Data",
    "summary": "How Little by Little handles personal data under the Philippine Data Privacy Act of 2012, its Implementing Rules and Regulations, and applicable National Privacy Commission issuances.",
    "sections": [
      {
        "id": "controller",
        "heading": "Responsible operator and contact",
        "paragraphs": [
          "Michael Don D. Alaiza, operating Little by Little in the Philippines, is the personal information controller for account administration and the service processing described here. Contact alaizamichael@gmail.com for privacy questions, requests, incidents, or complaints. This email is the published privacy contact; it is not a claim of NPC certification.",
          "This notice describes the website, application, and optional cloud service. It explains processing and does not request a waiver of your rights. We are accountable for our processing, including where a service provider acts on our behalf."
        ]
      },
      {
        "id": "device",
        "heading": "Local writing and backups",
        "paragraphs": [
          "Your workspace includes manuscripts, chapters, characters, world building, references, notes, preferences, and recovery history. Local writing uses storage on your device. The public website’s sample editor is temporary and is not saved by the application. Proofreading and writing-analysis features run locally.",
          "Local manuscripts, workspace exports, and desktop backup files do not have application-level encryption. Desktop automatic backups are enabled by default where available, normally in Documents/Little by Little Backups. You can change or pause the folder. A folder connected to another backup or sync service may be copied by that service under your settings.",
          "The operator does not receive locally stored manuscripts through the local saving feature. Optional cloud synchronization and online word lookups send the information described below. Signing out does not remove manuscripts already stored on the device."
        ]
      },
      {
        "id": "account-data",
        "heading": "Information used for accounts and support",
        "paragraphs": [
          "Registration and sign-in send your email address and password to Supabase Auth. The account service processes identifiers, verification and authentication events, session information, and connection metadata. The application retains session information to maintain your sign-in; it does not store your password in the manuscript workspace.",
          "Registration also submits the terms and privacy versions you acknowledged and a time reported by your device. We do not request your birth date or an identity document at signup. If you contact support, we receive the address, message, and attachments you choose to send. Please omit unnecessary personal information.",
          "When enabled, Cloudflare Turnstile loads on account forms before submission and processes browser, device, network, and challenge information for abuse prevention. Hosting infrastructure also processes ordinary connection information to deliver pages and protect the service."
        ]
      },
      {
        "id": "cloud-data",
        "heading": "Optional cloud workspace processing",
        "paragraphs": [
          "Cloud saves process the entire portable workspace, not only the open chapter. This can include manuscripts, characters, world building, research, notes, and preferences. Supabase stores the current snapshot with an owner identifier, revision, and save time. Local revision checkpoints are not a separate cloud archive.",
          "Signing in may retrieve existing cloud work. A new connection requires a starting-workspace choice before uploading different local writing. Once linked and enabled, sync automatically sends saved changes. Previously linked devices may resume synchronization after sign-in. Pause sync to stop future synchronization on that device; existing stored data remains.",
          "Cloud writing is not publicly listed by the service. It is not end-to-end encrypted, so authorized service administrators can technically access it. Access by the operator is permitted only where necessary for a legitimate service, support, security, or legal purpose."
        ]
      },
      {
        "id": "purposes",
        "heading": "Purposes and lawful grounds",
        "paragraphs": [
          "Account authentication and requested cloud storage use personal information necessary to perform our agreement with you. Support information is used to respond to your request. Proportionate security and abuse prevention may rely on legitimate interests after assessing necessity and the effect on your rights. Legally required processing relies on the relevant legal obligation.",
          "Where consent is the appropriate basis, we must obtain a specific, informed choice before that processing. You may withdraw it. Acknowledging this notice is not blanket consent. Contract and legitimate interests are not a substitute for a separate legal condition when sensitive personal information or privileged information is involved.",
          "We do not sell or rent personal data or manuscripts, use writing to train AI models, or use it for targeted advertising. The application has no advertising or analytics tracker. We do not use manuscript content for automated decisions producing legal or similarly significant effects. Any new purpose must first be explained and have a lawful basis."
        ]
      },
      {
        "id": "word-tools",
        "heading": "Online word tools and your choices",
        "paragraphs": [
          "If you request an online definition or synonyms, the selected English word is sent to FreeDictionaryAPI.com, dictionaryapi.dev, or Datamuse as needed. The surrounding paragraph and full manuscript are not sent by this feature. The provider receives the requested word and ordinary connection information.",
          "You can avoid these requests by not using online lookups and continue writing locally. Do not look up a secret or sensitive name you do not want transmitted. The providers have their own terms and privacy practices."
        ],
        "links": [
          {
            "label": "FreeDictionaryAPI.com",
            "url": "https://freedictionaryapi.com/"
          },
          {
            "label": "dictionaryapi.dev",
            "url": "https://dictionaryapi.dev/"
          },
          {
            "label": "Datamuse",
            "url": "https://www.datamuse.com/api/"
          }
        ]
      },
      {
        "id": "sharing",
        "heading": "Recipients and international processing",
        "paragraphs": [
          "Supabase provides authentication and cloud storage. Cloudflare provides bot protection where enabled. Website hosting and email providers process information needed to deliver pages and messages. Online dictionary providers receive the requested word and connection information. We limit disclosures to the relevant purpose.",
          "We may disclose information when required by a lawful order or another applicable legal basis. Any disclosure must be necessary and proportionate. Outsourcing or transfer abroad does not remove our accountability. Providers processing on our behalf must be subject to appropriate contractual and security safeguards.",
          "Processing may occur outside the Philippines. The deployment’s provider regions and transfer arrangements have not yet been confirmed in this notice. Contact the operator for the current details before choosing cloud storage. This notice does not promise Philippine-only storage."
        ],
        "links": [
          {
            "label": "Supabase privacy policy",
            "url": "https://supabase.com/privacy"
          },
          {
            "label": "Cloudflare Turnstile privacy information",
            "url": "https://www.cloudflare.com/privacypolicy/"
          }
        ]
      },
      {
        "id": "security",
        "heading": "Security obligations and current protections",
        "paragraphs": [
          "We are responsible for reasonable and appropriate organizational, physical, and technical safeguards. Security measures must reflect the information handled and its risks. Describing a limitation does not make an inadequate safeguard acceptable or transfer our responsibility to you.",
          "The application requires HTTPS for cloud connections and uses authenticated ownership and session checks for cloud workspace access. Native mobile login sessions use encrypted storage with a device-protected key. Browser and Electron sessions use the authentication client’s browser storage. These session protections do not encrypt manuscripts or exported backups.",
          "Cloud saves are not end-to-end encrypted. Local manuscripts and backups lack application-level encryption. Encryption at rest for the deployed cloud database and provider backups requires separate verification; HTTPS alone does not establish that protection. No statement here guarantees perfect security or waives your legal remedies.",
          "Do not upload sensitive personal information or privileged material through the ordinary cloud-writing feature. Protect shared devices and backup folders. Report suspected exposure to the privacy contact promptly. These precautions supplement, and do not replace, our obligations."
        ]
      },
      {
        "id": "incidents",
        "heading": "Security incidents and breach notification",
        "paragraphs": [
          "We must assess and document security incidents, contain their effects, and take appropriate remedial action. When a personal-data breach meets the legal notification criteria, we must notify the NPC and affected individuals within the applicable 72-hour period from knowledge or reasonable belief that a notifiable breach occurred, subject only to lawful exceptions.",
          "Required notices must explain the incident, affected information, protective measures, and a contact for assistance. We will provide further information as required. The reporting obligation is not conditional on a user agreeing to these terms."
        ]
      },
      {
        "id": "retention",
        "heading": "How long information remains",
        "paragraphs": [
          "Local work remains until you or your device remove it. Recovery history may retain earlier versions after a story is deleted. Desktop backups keep a latest copy and up to 30 historical copies. Downloaded files remain in the locations you choose until removed.",
          "Account and current cloud workspace information are kept while needed to provide the requested service, subject to a valid deletion request and applicable obligations. Support messages, security records, and acknowledgment records must be retained only for their documented purpose and any necessary legal period, then securely deleted or anonymized. Information must not be kept indefinitely for an unspecified possible use.",
          "Specific retention periods for hosted logs, support records, acknowledgment records, and provider backups are not yet confirmed in this notice. These periods must be established and disclosed before this notice is treated as finalized for public cloud operation. The privacy contact can address questions about existing records."
        ]
      },
      {
        "id": "deletion",
        "heading": "Account closure and deletion requests",
        "paragraphs": [
          "Request account closure or cloud deletion by emailing alaizamichael@gmail.com, preferably from the registered address. If you have lost access, explain that so an alternative proportionate verification can be considered. There is currently no self-service account-deletion screen. Export work you wish to keep before deletion.",
          "Sign-out, paused sync, and uninstalling do not delete the cloud account. Where a request is valid, we must remove data no longer lawfully needed and explain any information retained, the reason, and the applicable period. Backup copies awaiting expiry must remain protected and must not be restored into active use contrary to a valid deletion request. Local copies and exports require separate removal."
        ]
      },
      {
        "id": "rights",
        "heading": "Your rights and how to exercise them",
        "paragraphs": [
          "Subject to the conditions and exceptions in Philippine law, you have rights to information, access, correction, objection, erasure or blocking, data portability, damages, and filing a complaint. Where processing relies on consent, you may withdraw it without affecting earlier lawful processing. Authorized representatives, lawful heirs, and assignees may exercise rights where the law permits.",
          "Email the privacy contact describing the request and affected account or information. We may verify identity proportionately and will explain the result, any lawful limitation, and available recourse within applicable deadlines. Do not send passwords or unnecessary identity documents. Requests need not use technical legal language.",
          "You may complain to the National Privacy Commission through its official procedures. An internal support request does not waive that right. You can also choose local writing, decline cloud storage, export work, or avoid online lookups. Required account information is necessary to provide accounts, not to write locally."
        ],
        "links": [
          {
            "label": "National Privacy Commission: data subject rights and complaints",
            "url": "https://privacy.gov.ph/data-subject-rights/"
          }
        ]
      },
      {
        "id": "children",
        "heading": "Age limits and information about other people",
        "paragraphs": [
          "Cloud registration is for adults aged 18 or older with legal capacity. We do not intentionally invite children to create cloud accounts. A parent, guardian, or affected person may contact us about a child’s information so we can review and address it.",
          "Avoid including unnecessary identifying details about real people in manuscripts, notes, or support messages. Ordinary fiction-writing features do not supply permission to process another person’s information unlawfully. If sensitive or privileged information reaches us inadvertently, contact us for appropriate handling."
        ]
      },
      {
        "id": "notice-updates",
        "heading": "Notice changes",
        "paragraphs": [
          "This notice is dated 6 November 2026. We will explain material changes through the service or account email and provide updated information before new processing where required. New uses require an appropriate legal basis and a separate consent choice when applicable. Publishing an update does not retrospectively authorize a new use.",
          "The notice describes processing and obligations; it is not a certificate that every operational requirement has been fulfilled. Your statutory rights continue regardless of the notice version."
        ]
      }
    ]
  }
};
