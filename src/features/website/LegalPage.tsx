import { LEGAL_DOCUMENTS, LEGAL_OPERATOR, LEGAL_UPDATED_LABEL } from '../legal/lib/legalPolicies';
import { LEGAL_VERSION } from '../legal/lib/policyConsent';
import { SiteLegalLinks, Wordmark } from './Website';
import './website.css';

type Props = { document: 'terms' | 'privacy' };

// Feature: permanent public policy documents use the same versioned content shown inside the writing desk.
export default function LegalPage({ document }: Props) {
  const policy = LEGAL_DOCUMENTS[document];
  return <div className="website website-legal">
    <a className="site-skip" href="#main">Skip to content</a>
    <header className="site-header"><Wordmark /><a href="/app">Open writing desk</a></header>
    <main id="main" className="legal-main">
      <nav className="legal-document-nav" aria-label="Policy documents"><a href="/terms" aria-current={document === 'terms' ? 'page' : undefined}>Terms of Service</a><a href="/privacy" aria-current={document === 'privacy' ? 'page' : undefined}>Privacy Notice</a></nav>
      <article aria-labelledby="legal-title">
        <header className="legal-intro"><h1 id="legal-title">{policy.title}</h1><p className="legal-date">Updated <time dateTime={LEGAL_VERSION}>{LEGAL_UPDATED_LABEL}</time> · Version {LEGAL_VERSION}</p><p className="legal-summary">{policy.summary}</p><p>Operator: {LEGAL_OPERATOR.name}<br /><a href={`mailto:${LEGAL_OPERATOR.email}`}>{LEGAL_OPERATOR.email}</a></p></header>
        <nav className="legal-contents" aria-label="On this page"><h2>On this page</h2><ol>{policy.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.heading}</a></li>)}</ol></nav>
        <div className="legal-sections">{policy.sections.map((section) => <section id={section.id} key={section.id} aria-labelledby={`${section.id}-heading`}><h2 id={`${section.id}-heading`}>{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.links?.length ? <ul className="legal-source-links">{section.links.map((link) => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label} (opens in a new tab)</a></li>)}</ul> : null}</section>)}</div>
        <div className="legal-contact"><h2>Questions or requests</h2><p>Contact {LEGAL_OPERATOR.name} at <a href={`mailto:${LEGAL_OPERATOR.email}`}>{LEGAL_OPERATOR.email}</a>. Include the account email if your request concerns an account. Never send your password.</p></div>
      </article>
      <a className="site-text-link" href="/">Back to home</a>
    </main>
    <footer className="site-footer"><Wordmark /><SiteLegalLinks /><a href="#main">Back to top</a></footer>
  </div>;
}
