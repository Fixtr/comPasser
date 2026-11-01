import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_PUBLIC_APP_URL } from '../src/domains/itinerary/services/share-url.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('ionic-shell.html');
const manifest = JSON.parse(read('public/manifest.json'));
const meta = (attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];

test('the shell describes the app with the same copy as the manifest', () => {
  assert.equal(meta('name', 'description'), manifest.description);
  assert.equal(meta('property', 'og:description'), manifest.description);
  assert.equal(meta('property', 'og:title'), 'ComPasser');
  assert.equal(meta('property', 'og:type'), 'website');
  assert.equal(meta('name', 'twitter:card'), 'summary');
});

test('the preview image is an absolute URL on the public origin and exists in public/', () => {
  const image = meta('property', 'og:image');
  assert.ok(image?.startsWith(`${DEFAULT_PUBLIC_APP_URL}/`), `unexpected og:image: ${image}`);
  assert.ok(existsSync(new URL(`../public${new URL(image).pathname}`, import.meta.url)));
});

test('the shell claims no single URL, because Pages serves it for every SPA route including /share/<id>', () => {
  assert.doesNotMatch(html, /property="og:url"|rel="canonical"/);
});
