import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const html = readFileSync(new URL('../ionic-shell.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/prototype/ionic-shell.css', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../src/prototype/ionic-shell.jsx', import.meta.url), 'utf8');

function token(name) {
  const m = new RegExp(`--cp-${name}\\s*:\\s*([^;]+);`).exec(tokens);
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

test('meta theme-color 는 지면색 하나로 고정이다', () => {
  const metas = [...html.matchAll(/<meta\s+name="theme-color"[^>]*>/g)].map(m => m[0]);
  assert.equal(metas.length, 1);
  assert.equal(/content="([^"]+)"/.exec(metas[0])[1].trim().toLowerCase(), token('paper'));
  // 라이트 전용이라 스크립트가 이 값을 바꿔 쓸 일이 없다.
  assert.doesNotMatch(html.replace(metas[0], '') + shell, /theme-color/);
});

test('OS 다크와 브라우저 자동 다크를 따르지 않는다고 선언한다', () => {
  assert.match(html, /<meta name="color-scheme" content="only light"/);
  assert.match(tokens, /:root\s*\{[^}]*color-scheme:\s*only light;/);
  // 예전에 저장된 'theme' 값은 읽지 않고 지운다.
  assert.match(html, /localStorage\.removeItem\('theme'\)/);
  assert.doesNotMatch(html + shell, /localStorage\.(?:get|set)Item\('theme'/);
});

const sources = dir => readdirSync(new URL(dir, import.meta.url), { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(?:m?js|jsx|css|html)$/.test(entry.name) && entry.name !== 'compasser-preview.html')
  .map(entry => join(entry.parentPath, entry.name));

test('다크 모드가 소스에 다시 들어오지 않는다', () => {
  const files = [...sources('../src/'), ...sources('../public/'), fileURLToPath(new URL('../ionic-shell.html', import.meta.url))];
  assert.ok(files.length > 50, '검사할 소스를 찾지 못했다');
  const banned = /prefers-color-scheme|data-theme|data-route-theme|\.dark\b|color-scheme:[^;]*dark|light-dark\(|ion-palette-dark|high-contrast-dark/;
  const hits = files.filter(file => banned.test(readFileSync(file, 'utf8')));
  assert.deepEqual(hits, []);
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

test('노치 아래로 내용이 숨지 않는다', () => {
  // viewport-fit=cover 를 쓰면 상태 표시줄 아래까지 내용이 들어간다.
  assert.match(css, /env\(safe-area-inset-top\)/, '위쪽 안전 영역을 비켜 주지 않는다');
});
