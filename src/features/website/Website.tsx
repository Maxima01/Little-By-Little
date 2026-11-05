import { useState } from 'react';
import { countTextWords } from '../../domain/model';
import LandingAccount, { type AccountMode } from './LandingAccount';
import './website.css';

const opening = 'The sea had kept its promise.\n\nMara found the lantern burning in the upstairs window, exactly where she had left it eleven years before. Beneath the glass, a folded letter waited.\n\nShe knew the handwriting. That was the impossible part.';
const questions = [
  ['Do I need an account?', 'No. Create a story for free and save on this device as you write. Sign in or register whenever you want cloud saves, here or from Cloud saves at the writing desk.'],
  ['Where does my writing go?', 'Your workspace saves locally as you write. Download a workspace backup to keep another copy: clearing browser data or using a private window can remove local work. Cloud sync is optional.'],
  ['Can I take my manuscript with me?', 'Export your story as PDF, Word, EPUB, Markdown, plain text or HTML. Workspace backups also include your characters, world building, notes and revision history.'],
  ['Does it work on a smaller screen?', 'Yes. The browser workspace adapts to smaller screens, with collapsible navigation and chapter context. The desktop app also offers automatic backups to a folder you choose.'],
] as const;

// Feature: a consistent wordmark links public pages home without touching the writer’s local library.
export function Wordmark() {
  return <a className="site-wordmark" href="/" aria-label="Little by Little home"><svg width="28" height="32" viewBox="0 0 28 32" aria-hidden="true"><path d="M18 3C11 9 17 15 10 27M10 27h10M7 27h1" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg><span>little by little</span></a>;
}

// Feature: public footer links keep account terms and privacy information available without signing in.
export function SiteLegalLinks() {
  return <nav className="site-legal-links" aria-label="Legal"><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Notice</a></nav>;
}

// Feature: this temporary sample demonstrates word counting without saving or transmitting visitors’ text.
function WritingSample() {
  const [text, setText] = useState(opening);
  const [focus, setFocus] = useState(false);
  return <div className={`site-sample${focus ? ' site-sample-focused' : ''}`} data-ui>
    <div className="sample-top"><span>Try the writing desk</span><button type="button" aria-pressed={focus} onClick={() => setFocus(!focus)}>{focus ? 'Show context' : 'Focus'}</button></div>
    <div className="sample-body">
      <div className="sample-manuscript"><h2>The light between tides</h2><label className="site-sr-only" htmlFor="sample-draft">Edit this sample draft</label><textarea id="sample-draft" value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} spellCheck aria-describedby="sample-notice" /></div>
      {!focus && <aside className="sample-context"><h3>Chapter context</h3><p>Scene 1</p><dl><dt>Setting</dt><dd>The house by the sea</dd><dt>Characters present</dt><dd>Mara</dd><dt>Continuity note</dt><dd>The lantern has burned for eleven years.</dd></dl></aside>}
    </div>
    <div className="sample-bottom"><output aria-live="polite">{countTextWords(text)} words</output><span id="sample-notice">Sample only · not saved</span></div>
  </div>;
}

// Feature: the browser landing page explains local saving, demonstrates drafting, and opens the real application.
export function LandingPage() {
  const [answer, setAnswer] = useState(0);
  // Feature: sign-in and registration links select the optional account form without blocking the free desk.
  const [accountMode, setAccountMode] = useState<AccountMode>('signin');
  return <div className="website">
    <a className="site-skip" href="#main">Skip to content</a>
    <header className="site-header"><Wordmark /><nav aria-label="Website"><a href="#workspace">The workspace</a><a href="#questions">Questions</a><a className="site-account-link" href="#account" onClick={() => setAccountMode('signin')}>Sign in</a><a className="site-account-link" href="#account" onClick={() => setAccountMode('register')}>Register</a></nav></header>
    <main id="main">
      <section className="site-hero" aria-labelledby="hero-title">
        {/* Feature: one open manuscript spread joins the product introduction and editable sample in the existing brand palette. */}
        <div className="hero-sheet">
        <div className="hero-copy"><h1 id="hero-title">A little<br />more story</h1><p>A writing space for your manuscript, your characters, and the world they live in.</p><a className="site-action" href="/app">Create a story for free</a><p className="hero-note">No account needed. Write now, add cloud saves later.</p></div>
        <div className="hero-work"><WritingSample /></div>
        </div>
      </section>
      <section className="site-workspace" id="workspace" aria-labelledby="workspace-title">
        <div className="section-intro"><h2 id="workspace-title">Room for the whole story</h2><p>Keep the draft in front of you and the details close by. Move from a chapter to a character, a setting, or a note without leaving your story.</p></div>
        <figure className="workspace-figure"><img src="/website/writing-desk.png" alt="Little by Little manuscript editor with chapter navigation and scene context beside the draft" width="1440" height="900" loading="lazy" /><figcaption>The browser workspace, with an example story.</figcaption></figure>
        {/* Feature: real workspace details sit beside their explanation, so each image proves a specific writing task. */}
        <div className="workspace-details"><div><h3>Follow the thread</h3><p>Link your scenes to characters and settings. Keep profile details, world history, research and author notes alongside your chapters.</p></div><figure><img src="/website/chapter-context.png" alt="Scene context and character tracking beside the manuscript" width="300" height="520" loading="lazy" /></figure></div>
        <div className="workspace-crops"><figure><img src="/website/story-library.png" alt="Story hub with chapters, recent activity, and reference collections" width="960" height="650" loading="lazy" /><figcaption>A home for each story.</figcaption></figure><div><h3>A place to return to</h3><p>When it is time to revise, use passage tasks, find and replace, chapter comparisons and recoverable save history.</p></div></div>
      </section>
      <section className="site-keeping" aria-labelledby="keeping-title"><div><h2 id="keeping-title">Yours, page by page</h2><p>Local saving keeps your work on this device. Download backups, return to saved revisions, and export a manuscript when you are ready to share it.</p><p>Want to write on another device? Optional account-based cloud saves let you choose when to sync.</p><a className="site-text-link" href="#questions">How saving works</a></div><figure><img src="/website/save-history.png" alt="Workspace save and recovery controls in Little by Little" width="660" height="430" loading="lazy" /><figcaption>Keep a backup outside your browser, too.</figcaption></figure></section>
      <section className="site-questions" id="questions" aria-labelledby="questions-title"><h2 id="questions-title">Before the first page</h2><div className="question-layout"><div className="question-index">{questions.map(([question], index) => <button id={`question-${index}`} key={question} type="button" aria-expanded={index === answer} aria-controls="question-answer" onClick={() => setAnswer(index)}>{question}<span aria-hidden="true">{index === answer ? '−' : '+'}</span></button>)}</div><div className="question-answer" id="question-answer" role="region" aria-labelledby={`question-${answer}`}><h3>{questions[answer][0]}</h3><p>{questions[answer][1]}</p></div></div></section>
      <LandingAccount mode={accountMode} onModeChange={setAccountMode} />
      <section className="site-close"><h2>One page is a beginning</h2><p>Start for free. Sign in whenever you’re ready for cloud saves.</p><a className="site-action" href="/app">Create a story for free</a></section>
    </main>
    <footer className="site-footer"><Wordmark /><SiteLegalLinks /><a href="#main">Back to top</a></footer>
  </div>;
}

// Feature: missing browser routes offer direct recovery paths without displaying untrusted URL text.
export function NotFoundPage() {
  return <div className="website website-not-found"><header className="site-header"><Wordmark /><a href="/app">Open writing desk</a></header><main className="not-found-main"><p className="not-found-number" aria-hidden="true">404</p><h1>A page out of place</h1><p>We couldn’t find this page. Your next chapter is still waiting at the writing desk.</p><div><a className="site-action" href="/">Back to home</a><a className="site-text-link" href="/app">Open writing desk</a></div></main><footer className="site-footer"><p>little by little</p><SiteLegalLinks /></footer></div>;
}
