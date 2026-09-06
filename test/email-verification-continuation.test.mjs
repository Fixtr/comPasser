import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmailVerificationSettings } from '../src/domains/auth/services/email-verification-continuation.mjs';

test('웹 인증 메일의 계속 버튼은 같은 서비스의 로그인과 원래 일정으로 이어진다', () => {
  for (const returnTo of ['/share/abc123', '/view/ABC123']) {
    const settings = getEmailVerificationSettings({ returnTo, origin: 'https://app.example' });
    const continuation = new URL(settings.url);
    assert.equal(continuation.origin, 'https://app.example');
    assert.equal(continuation.pathname, '/login');
    assert.equal(continuation.searchParams.get('next'), returnTo);
  }
});

test('기존 일반 가입은 인증 메일 설정을 추가하지 않는다', () => {
  assert.equal(getEmailVerificationSettings({ origin: 'https://app.example' }), null);
  assert.equal(getEmailVerificationSettings(), null);
});

test('네이티브 가입은 localhost 또는 앱 스킴을 메일에 담지 않는다', () => {
  for (const origin of ['http://localhost', 'https://localhost', 'capacitor://localhost', 'https://app.example']) {
    assert.equal(getEmailVerificationSettings({ returnTo: '/share/abc123', origin, isNative: true }), null);
  }
});

test('안전한 일정 상세가 아니면 메일 복귀 설정도 만들지 않는다', () => {
  for (const returnTo of ['https://evil.example', '//evil.example', '/plan', '/share/abc?next=evil', '/share/abc\n']) {
    assert.equal(getEmailVerificationSettings({ returnTo, origin: 'https://app.example' }), null);
  }
});

test('웹 origin이 없거나 웹 주소가 아니면 기본 인증 메일을 유지한다', () => {
  for (const origin of [undefined, '', 'not-a-url', 'capacitor://localhost', 'file:///app', 'javascript:alert(1)']) {
    assert.equal(getEmailVerificationSettings({ returnTo: '/share/abc123', origin }), null);
  }
});
