import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { defaultAvatarUrl } from '../src/domains/profile/services/profile-service.mjs';

const svgOf = url => decodeURIComponent(url.slice(url.indexOf(',') + 1));

test('the default avatar is drawn in the app and shows the first letter of the name', () => {
  const url = defaultAvatarUrl('sunkyu');
  assert.match(url, /^data:image\/svg\+xml,/);
  assert.match(svgOf(url), />S<\/text>/);
  assert.match(svgOf(defaultAvatarUrl('  김선규')), />김<\/text>/);
  assert.match(svgOf(defaultAvatarUrl('')), />U<\/text>/, 'no name falls back to U, as "User" did');
  assert.match(svgOf(defaultAvatarUrl(undefined)), />U<\/text>/);
});

test('a name cannot break out of the avatar markup', () => {
  assert.match(svgOf(defaultAvatarUrl('<script>')), />&lt;<\/text>/);
  assert.match(svgOf(defaultAvatarUrl('&co')), />&amp;<\/text>/);
});

test('the profile screen sends the display name to no outside avatar service', () => {
  const view = readFileSync(new URL('../src/domains/profile/ui/profile-view.js', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /ui-avatars/);
  assert.match(view, /user\.photoURL \|\| defaultAvatarUrl\(user\.displayName\)/);
});
