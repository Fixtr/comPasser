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
