import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');

// The policy must describe what the app really does (checked against the code on 2026-10-29).
test('the privacy policy covers email sign-up, public content, device storage and its processors, in Korean and English', () => {
  assert.doesNotMatch(policy, /이용약관/, 'there are no terms of service to refer to');
  for (const text of ['이메일로 회원가입', '공개 코스', '여행자 후기', '해시값', 'localStorage', 'Cloudflare', '회원 탈퇴를 신청']) {
    assert.ok(policy.includes(text), `Korean policy mentions ${text}`);
  }
  assert.match(policy, /<section class="translation" id="en" lang="en">/);
  for (const text of ['When you sign up with email', 'What becomes public', 'Korean text prevails']) {
    assert.ok(policy.includes(text), `English translation mentions ${text}`);
  }
});
