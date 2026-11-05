import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { prepareDesktopHtml } from '../scripts/desktop-html.mjs';

// Feature: the packaged document applies an early CSP without blocking its required local resources.
test('desktop HTML protects executable code and network access before loading the renderer', () => {
  const html = prepareDesktopHtml('<!doctype html><html><head><script src="/_expo/static/js/web/app.js"></script><link href="/_expo/static/css/app.css" rel="stylesheet"></head><body></body></html>', 'https://project.supabase.co');
  const document = new JSDOM(html).window.document;
  const meta = document.head.firstElementChild;
  assert.equal(meta.httpEquiv, 'Content-Security-Policy');
  assert.match(meta.content, /(?:^|; )script-src 'self';/);
  assert.match(meta.content, /style-src 'self' 'unsafe-inline'/);
  assert.match(meta.content, /connect-src [^;]*https:\/\/project\.supabase\.co(?:;|$)/);
  assert.doesNotMatch(meta.content, /unsafe-eval|frame-ancestors|challenges\.cloudflare\.com/);
  assert.equal(document.querySelector('script').getAttribute('src'), './_expo/static/js/web/app.js');
  assert.equal(document.querySelector('link').getAttribute('href'), './_expo/static/css/app.css');
  assert.throws(() => prepareDesktopHtml(html, 'https://user:password@project.supabase.co'), /without credentials/);
});

// Feature: rebuilding replaces obsolete policies while retaining unrelated metadata and document content.
test('desktop HTML replaces existing CSP metadata idempotently', () => {
  const original = '<!-- <head></head> --><html><HEAD><meta name="description" content="keep"><meta name="example" content="http-equiv=Content-Security-Policy"><META content="script-src *" HTTP-EQUIV=Content-Security-Policy><meta http-equiv=\'content-security-policy\' content="default-src *"><title>Story</title></HEAD><body>Writing</body></html>';
  const secured = prepareDesktopHtml(original);
  const document = new JSDOM(secured).window.document;
  assert.equal(document.querySelectorAll('meta[http-equiv]').length, 1);
  assert.equal(document.querySelector('meta[name="description"]').content, 'keep');
  assert.equal(document.querySelector('meta[name="example"]').content, 'http-equiv=Content-Security-Policy');
  assert.equal(document.title, 'Story');
  assert.equal(document.body.textContent, 'Writing');
  assert.doesNotMatch(document.head.firstElementChild.content, /script-src \*/);
  assert.equal(prepareDesktopHtml(secured), secured);
});

// Feature: malformed exports stop packaging instead of silently producing an unprotected renderer.
test('desktop HTML rejects exports without a complete head', () => {
  for (const html of ['<html><body>Writing</body></html>', '<!-- <head></head> --><html><body>Writing</body></html>', '<html><head><script src="app.js"></script></html>']) {
    assert.throws(() => prepareDesktopHtml(html), /complete HTML head/);
  }
});
