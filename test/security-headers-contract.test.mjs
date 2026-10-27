/**
 * 다른 사이트가 우리 앱을 iframe 으로 감싸지 못하게 한다.
 *
 * 운영의 SPA 응답(/, /login, /share/… 등)에는 cache-control·referrer-policy·
 * x-content-type-options 만 붙어 있었다. 그래서 아무 사이트나 로그인 화면을
 * 투명한 iframe 으로 깔고 클릭을 가로챌 수 있었다(clickjacking).
 *
 * /en/routes·sitemap.xml·robots.txt 는 _worker.js 가 직접 CSP 를 붙이고,
 * _headers 는 워커 응답에 적용되지 않는다. 나머지 정적 응답과 SPA 폴백은
 * Cloudflare Pages 가 public/_headers 를 보고 헤더를 붙인다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILE = new URL('../public/_headers', import.meta.url);

/** `/*` 줄 아래 들여쓴 "이름: 값" 줄이 모든 경로에 붙는 헤더다. */
function allPathsHeader(name) {
  const block = readFileSync(FILE, 'utf8').match(/^\/\*[ \t]*\n((?:[ \t]+.*\n?)*)/m)?.[1] || '';
  return block.match(new RegExp(`^[ \\t]+${name}:[ \\t]*(.+)$`, 'mi'))?.[1].trim() || '';
}

test('같은 출처 밖에서는 iframe 으로 열리지 않는다', () => {
  const csp = allPathsHeader('Content-Security-Policy');
  // 'self': 같은 출처 iframe 은 공격 경로가 아니고, html2canvas 가 이미지 저장 때 만드는 복제 iframe 도 막지 않는다.
  assert.match(csp, /frame-ancestors 'self'/);
  // *-src 를 넣는 순간 Firebase·Maps·Kakao·Naver·GA 출처를 빠짐없이 적어야 하고, 하나만 빠져도 운영에서만 앱이 깨진다.
  assert.doesNotMatch(csp, /-src\b/);
});

test('브라우저에 HTTPS 만 쓰라고 알린다', () => {
  assert.match(allPathsHeader('Strict-Transport-Security'), /max-age=31536000/);
});
