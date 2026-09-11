import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 설치형(PWA)에서 안드로이드 상태 표시줄과 작업 전환기 색, 그리고 스플래시
 * 배경은 manifest 와 <meta name="theme-color"> 가 정한다. 화면 색을 바꾸면
 * 이 값들도 같이 움직여야 하는데, 서로 다른 파일에 있어서 조용히 어긋난다.
 *
 * 실제로 어긋나 있었다 — 결과 화면을 무채색으로 바꾼 뒤에도 두 값은
 * 보라(#7c3aed)로 남아, 종이색 화면 위에 보라 상태 표시줄이 얹히고
 * 스플래시가 보라로 번쩍인 뒤 밝은 앱이 뜨는 상태였다.
 */
const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/app/main.js', import.meta.url), 'utf8');

/** tokens.css 의 :root 블록에서 값을 읽는다(body.dark 쪽과 섞이지 않게). */
function token(name) {
  const root = tokens.slice(tokens.indexOf(':root'), tokens.indexOf('body.dark'));
  const m = new RegExp(`--cp-${name}\\s*:\\s*([^;]+);`).exec(root);
  assert.ok(m, `--cp-${name} 토큰을 찾지 못했다`);
  return m[1].trim().toLowerCase();
}

test('manifest 의 theme_color 가 화면 지면색과 같다', () => {
  assert.equal(manifest.theme_color.toLowerCase(), token('paper'));
});

test('스플래시 배경이 앱 지면색과 같다', () => {
  // 다르면 스플래시가 한 색으로 번쩍인 뒤 다른 색 앱이 뜬다.
  assert.equal(manifest.background_color.toLowerCase(), token('paper'));
});

test('meta theme-color 가 라이트/다크 각각 지면색과 같다', () => {
  const metas = [...html.matchAll(/<meta\s+name="theme-color"[^>]*>/g)].map(m => m[0]);
  assert.ok(metas.length >= 2, '라이트/다크 두 개를 선언해야 한다 (받은 개수: ' + metas.length + ')');

  const light = metas.find(m => !m.includes('prefers-color-scheme: dark'));
  const dark = metas.find(m => m.includes('prefers-color-scheme: dark'));
  assert.ok(light && dark, 'prefers-color-scheme 로 구분된 두 선언이 필요하다');

  const contentOf = (tag) => /content="([^"]+)"/.exec(tag)[1].trim().toLowerCase();
  assert.equal(contentOf(light), token('paper'));

  const darkRoot = tokens.slice(tokens.indexOf('body.dark'));
  const darkPaper = /--cp-paper\s*:\s*([^;]+);/.exec(darkRoot)[1].trim().toLowerCase();
  assert.equal(contentOf(dark), darkPaper);
});

/**
 * 아래는 "설치해서 폰에서 쓰는 앱"으로서의 조건들이다.
 * 브라우저 탭에서는 티가 안 나지만 홈 화면에서 띄우면 바로 드러난다.
 */

test('핀치 줌을 막지 않는다', () => {
  // user-scalable=no 는 저시력 사용자에게서 확대 수단을 통째로 뺏는다.
  // 낯선 도시에서 작은 글씨의 주소를 읽어야 하는 앱이라 더 그렇다.
  const viewport = /<meta\s+name="viewport"[\s\S]*?>/.exec(html);
  assert.ok(viewport, 'viewport 메타가 없다');
  const content = /content="([^"]+)"/.exec(viewport[0])[1];
  assert.doesNotMatch(content, /user-scalable\s*=\s*no/, '핀치 줌이 막혀 있다');
  assert.doesNotMatch(content, /maximum-scale/, '최대 배율을 묶어 두면 확대가 제한된다');
  assert.match(content, /viewport-fit=cover/, '노치 대응은 유지해야 한다');
});

test('첫 페인트 전에 테마가 정해진다', () => {
  // main.js 는 모듈이라 문서 파싱이 끝난 뒤 실행된다. 거기서 테마를 정하면
  // 시스템이 다크인 폰에서 흰 화면이 한 번 번쩍인 뒤 어두워진다.
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /data-theme/, 'head 안에서 테마를 정하는 코드가 없다');
  assert.match(head, /prefers-color-scheme/, '시스템 설정을 읽지 않는다');
  assert.match(head, /localStorage/, '사용자가 고른 값을 먼저 봐야 한다');
});

test('다크 팔레트는 data-theme 로도 걸린다', () => {
  // 첫 페인트 전에는 body 가 아직 없다. 그래서 html 요소에 표시한다.
  assert.match(tokens, /\[data-theme="dark"\]/, 'data-theme="dark" 규칙이 없다');
  // 같은 값을 두 곳에 적으면 갈라진다. 한 규칙이 두 셀렉터를 함께 받아야 한다.
  const darkRule = /(:root\[data-theme="dark"\][^{]*|body\.dark[^{]*)\{/.exec(tokens);
  assert.ok(darkRule, '다크 팔레트 규칙을 찾지 못했다');
  assert.match(darkRule[0], /data-theme="dark"[\s\S]*body\.dark|body\.dark[\s\S]*data-theme="dark"/,
    '다크 값이 한 규칙에 모여 있어야 한다');
});

test('시스템 테마가 바뀌면 따라간다 — 사용자가 고른 적 없을 때만', () => {
  assert.match(main, /matchMedia\(\s*['"]\(prefers-color-scheme: dark\)['"]\s*\)/,
    '시스템 테마 변경을 듣지 않는다');
  assert.match(main, /addEventListener\(\s*['"]change['"]/, 'change 이벤트를 듣지 않는다');
  // 고른 적이 있으면 그 선택이 이긴다.
  assert.match(main, /localStorage\.getItem\(\s*['"]theme['"]\s*\)/, '저장된 선택을 확인하지 않는다');
});

test('설치형에서는 히어로가 자리를 덜 차지한다', () => {
  // 홈 화면에서 띄우면 브라우저 주소창이 없는 대신 이 헤더가 매 화면 위에
  // 200px 를 상시 점유했다. 설치형에서는 줄인다.
  //
  // 줄이는 값은 이제 커스텀 속성 한 벌이다 — 설치형과 결과 화면(지도에
  // 자리를 내줘야 한다)이 같은 것을 원하는데, 값을 두 곳에 적으면 한쪽만
  // 고쳐지는 날이 온다. 그래서 ① 조건이 값을 켜는지 ② .hero 가 그 값을
  // 실제로 읽는지, 두 쪽을 함께 본다.
  const block = /@media\s*\(display-mode:\s*standalone\)\s*\{[\s\S]*?\n\}/.exec(css);
  assert.ok(block, '(display-mode: standalone) 블록이 없다');
  assert.match(block[0], /--hero-pad\s*:/, '설치형에서 헤더 여백을 줄이지 않는다');
  assert.match(block[0], /--hero-sub\s*:\s*none/, '설치형에서 소개 문구를 감추지 않는다');

  const hero = /\.hero\s*\{([^}]*)\}/.exec(css);
  assert.ok(hero, '.hero 규칙이 없다');
  assert.match(hero[1], /padding\s*:\s*var\(--hero-pad/, '.hero 가 --hero-pad 를 읽지 않는다');
  const heroP = /\.hero p\s*\{([^}]*)\}/.exec(css);
  assert.match(heroP[1], /display\s*:\s*var\(--hero-sub/, '.hero p 가 --hero-sub 를 읽지 않는다');
});

test('노치 아래로 내용이 숨지 않는다', () => {
  // viewport-fit=cover 를 쓰면 상태 표시줄 아래까지 내용이 들어간다.
  assert.match(css, /env\(safe-area-inset-top\)/, '위쪽 안전 영역을 비켜 주지 않는다');
});

// 캡처의 라이트 팔레트와 원래 테마 복원은 itinerary-image-export.test.mjs에서 검증한다.

test('테마 버튼 라벨이 언어를 바꿔도 상태를 지킨다', () => {
  // 버튼에 data-i18n 이 고정돼 있으면, 다크 모드에서 언어를 바꾸는 순간
  // updateTexts() 가 "다크 모드"로 되돌려 놓는다(누르면 라이트로 가는데도).
  assert.match(main, /setAttribute\(\s*['"]data-i18n['"]\s*,\s*key\s*\)/,
    '테마에 따라 i18n 키를 바꾸지 않는다');
});
