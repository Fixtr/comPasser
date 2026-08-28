import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { authStyles } from '../src/domains/auth/ui/auth-style.js';
import {
  stripComments, stripSourceComments, assertNoShadows, assertNoGradients, assertNoHardcodedColors,
  assertNoModernColorFunctions, assertNoNamedColors, assertSquareRadius,
  assertNoLegacyTokens, assertTouchTargets, assertHostBoxSizing, extractInlineStyles,
} from './helpers/style-contract.mjs';

/**
 * 로그인 · 회원가입 · 이메일 인증.
 *
 * 세 화면은 같은 카드 위에 같은 입력과 같은 버튼을 얹은 것이라, 원래
 * 스타일의 80% 가 세 파일에 그대로 복제돼 있었다. 한 곳만 고치면 나머지
 * 둘이 조용히 갈라지므로 공용 모듈 하나로 합치고 계약을 건다.
 */
const css = stripComments(authStyles);
const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const LABEL = 'auth-style';

const VIEWS = ['login-view.js', 'join-view.js', 'verify-view.js'];
const viewSources = Object.fromEntries(VIEWS.map(name => [
  name,
  stripSourceComments(readFileSync(new URL(`../src/domains/auth/ui/${name}`, import.meta.url), 'utf8')),
]));

test('그림자를 쓰지 않는다', () => assertNoShadows(css, LABEL));
test('그라디언트를 쓰지 않는다', () => assertNoGradients(css, LABEL));
test('캡처가 못 읽는 색 함수를 쓰지 않는다', () => assertNoModernColorFunctions(css, LABEL));
test('라운드는 0 이거나 알약 토큰이다', () => assertSquareRadius(css, LABEL, tokens));
test('옛 토큰을 더 이상 읽지 않는다', () => assertNoLegacyTokens(css, LABEL));
test('이름 있는 색을 쓰지 않는다', () => assertNoNamedColors(css, LABEL));

test('색은 전부 토큰에서 온다', () => {
  // 소셜 로그인 버튼만 예외다. 각 사의 브랜드 가이드가 색을 못박고 있어서
  // 무채색으로 바꾸면 심사에서 막힌다. 대신 그 색도 토큰으로 이름을 준다.
  assertNoHardcodedColors(css, LABEL);
});

test('브랜드 버튼은 브랜드 토큰을 읽고, 그 토큰은 테마를 따라 바뀌지 않는다', () => {
  for (const name of ['--cp-kakao', '--cp-naver', '--cp-google-surface']) {
    assert.ok(tokens.includes(name), `${name} 토큰이 없다`);
  }
  assert.match(css, /\.kakao-btn[\s\S]{0,200}--cp-kakao/, '카카오 버튼이 브랜드 토큰을 써야 한다');
  assert.match(css, /\.naver-btn[\s\S]{0,200}--cp-naver/, '네이버 버튼이 브랜드 토큰을 써야 한다');
  assert.match(css, /\.google-btn[\s\S]{0,240}--cp-google/, '구글 버튼이 브랜드 토큰을 써야 한다');

  // 카카오 노랑이 다크 모드에서 회색이 되면 그것대로 가이드 위반이다.
  const darkBlock = /body\.dark\s*\{([\s\S]*?)\n\}/.exec(tokens);
  assert.ok(darkBlock, 'body.dark 블록을 찾지 못했다');
  for (const name of ['--cp-kakao', '--cp-naver', '--cp-google-surface']) {
    assert.doesNotMatch(darkBlock[1], new RegExp(`${name}\\s*:`), `${name} 가 다크에서 뒤집히고 있다`);
  }
});

test('호스트가 여백만큼 화면 밖으로 나가지 않는다', () => assertHostBoxSizing(css, LABEL));

test('터치 기기에서 입력과 버튼이 44px 이상이다', () => {
  assertTouchTargets(css, LABEL, ['.auth-input', '.auth-btn', '.social-btn', '.toggle-password']);
});

test('회원가입 링크가 인앱 브라우저에서만 스타일을 받지 않는다', () => {
  // .join-link 규칙이 인앱 브라우저 경고 배너 안의 <style> 에 들어 있었다.
  // 즉 일반 브라우저로 들어온 사용자에게는 이 링크가 아무 스타일 없이 보였다.
  assert.match(css, /\.join-link/, '공용 스타일에 .join-link 가 있어야 한다');
  assert.match(css, /\.login-link/, '공용 스타일에 .login-link 가 있어야 한다');
  assert.doesNotMatch(viewSources['login-view.js'], /\.join-link\s*\{/,
    '조건부로 삽입되는 배너 안에 링크 스타일이 남아 있다');
});

test('세 화면이 같은 스타일 모듈을 쓴다', () => {
  for (const name of VIEWS) {
    assert.match(viewSources[name], /from '\.\/auth-style\.js'/, `${name} 이 공용 모듈을 쓰지 않는다`);
    // import 만 해 놓고 자기 <style> 을 그대로 들고 있으면 아무것도 달라지지
    // 않는다. 실제로 login-view 가 한동안 그 상태였다.
    const styleTags = viewSources[name].match(/<style>([\s\S]*?)<\/style>/g) || [];
    assert.equal(styleTags.length, 1, `${name}: <style> 태그가 ${styleTags.length}개다`);
    assert.equal(styleTags[0], '<style>${authStyles}</style>',
      `${name}: <style> 안에 자기만의 규칙이 남아 있다`);
  }
});

test('화면 파일의 인라인 스타일에도 옛 색이 없다', () => {
  for (const name of VIEWS) {
    const src = viewSources[name];
    const inline = extractInlineStyles(src);
    assertNoHardcodedColors(inline, `${name}(inline)`);
    assertNoNamedColors(inline, `${name}(inline)`);
    assertNoGradients(inline, `${name}(inline)`);
    assertNoModernColorFunctions(inline, `${name}(inline)`);
    assertSquareRadius(inline, `${name}(inline)`, tokens);
  }
});

test('장식 이모지를 쓰지 않는다', () => {
  // 👁️ 🙈 ❌ ✅ ⚠️ 는 OS 가 정한 자기 색을 갖고 들어온다.
  for (const name of VIEWS) {
    const emoji = viewSources[name].match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) || [];
    assert.deepEqual(emoji, [], `${name}: 이모지가 남아 있다 (${[...new Set(emoji)].join(' ')})`);
  }
});

test('비밀번호 강도는 지도 색을 쓰지 않는다', () => {
  // 예전에는 "안전"이 #10B981 이었다. 그 값은 지도에서 "그날의 첫 장소"를
  // 뜻하는 --cp-start 와 같은 색이다. 상태색(--cp-ok)과 섞이면 안 된다.
  assert.doesNotMatch(viewSources['join-view.js'], /#10B981/i, '지도 초록을 상태색으로 쓰고 있다');
  assert.match(css, /\.strength-indicator\[data-strength[\s\S]{0,200}--cp-(ok|warn|danger)/,
    '강도 표시가 상태 토큰을 읽어야 한다');
});

test('쓰이지 않는 규칙을 들고 있지 않다', () => {
  // .features-grid 계열은 로그인 화면의 shadow DOM 안에 있는데, 실제 마크업은
  // index.html(광명 DOM)에 있다. 그림자 경계를 넘지 못하므로 한 번도 적용된 적이 없다.
  for (const dead of ['.features-grid', '.feature-card', '.feature-icon', '.signup-btn']) {
    assert.ok(!css.includes(dead), `${dead}: 적용될 수 없는 규칙이다`);
  }
});

/**
 * 네이티브에서 감추는 소셜 버튼(카카오·네이버).
 *
 * `.social-btn` 이 `display: flex` 라, 브라우저 기본의 `[hidden]` 규칙보다
 * 특이도가 높아 **이긴다.** 즉 `hidden` 만 붙이면 버튼이 그대로 보인다.
 * 결과 화면의 `.resolved-place[hidden]`·`.actions-primary` 에서 이미 한 번
 * 겪은 것과 같은 자리다.
 */
test('감춤은 CSS 가 갖는다 — social-btn 은 display:flex 라 hidden 을 이긴다', () => {
  assert.match(
    css,
    /\.social-btn\[hidden\][^{]*\{[^}]*display:\s*none/,
    '.social-btn[hidden] { display: none } 이 없으면 hidden 을 붙여도 안 사라진다'
  );
});

test('로그인 화면은 되는 방법만 그린다', () => {
  // 판단은 available-logins.mjs 한 곳이 갖는다. 화면에서 다시 조건을 적으면
  // 나중에 카카오를 네이티브로 붙일 때 고칠 자리가 둘이 된다.
  assert.match(
    viewSources['login-view.js'],
    /availableSocialLogins\s*\(/,
    '어느 버튼을 보여 줄지는 available-logins.mjs 가 정한다'
  );
  assert.ok(
    !/isNativePlatform\s*\(\s*\)[^\n]*(kakao|naver)/i.test(viewSources['login-view.js']),
    '화면에서 플랫폼 조건을 다시 적지 않는다'
  );
});
