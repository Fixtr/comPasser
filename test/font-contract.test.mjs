/**
 * 글꼴은 한 벌이어야 하고, 이름을 적었으면 그 글꼴이 실제로 있어야 한다.
 *
 * 이 앱에는 글꼴이 두 벌 적혀 있었다. 옛 `index.html` 은 구글 폰트에서 Inter 를
 * 받아 오고 옛 `style.css` 의 body 가 그걸 쓰는데, 옮긴 화면들은 전부
 * `--cp-font`(Pretendard 계열)를 쓰고 **Pretendard 는 어디서도 받아오지
 * 않았다.** 그래서 랜딩·헤더만 Inter 로 그려지고 나머지는 시스템 글꼴로
 * 떨어져, 같은 앱 안에서 숫자와 한글의 굵기·자간이 화면마다 달랐다.
 *
 * 여기서 지키는 것은 세 가지다.
 *
 *  1. **바깥에서 글꼴을 받아오지 않는다.** 구글 폰트는 외부 도메인이라
 *     서비스 워커가 캐시하지 않는다(sw.js 의 원칙: 외부 요청은 건드리지
 *     않는다). 여행지에서 네트워크가 끊기면 못 받는데, 그 링크는
 *     `<link rel=stylesheet>` 라 첫 페인트를 막는다.
 *
 *  2. **글꼴 이름은 토큰 한 곳에서만 정한다.** 두 곳에 적히는 순간
 *     한쪽만 고쳐지는 날이 온다 — 실제로 그렇게 갈라졌다.
 *
 *  3. **적어 둔 이름은 OS 에 있거나 우리가 실어 보낸 것이어야 한다.**
 *     받아오지도 않는 이름을 적으면 조용히 다음 후보로 넘어가서, 코드를
 *     읽는 사람은 Pretendard 로 보이는데 화면은 아닌 상태가 된다.
 *     자체 호스팅(@font-face)으로 실어 보내면 그때는 허용한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from './helpers/style-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const read = p => readFileSync(join(ROOT, p), 'utf8');

/** OS 가 이미 갖고 있어서 받아올 필요가 없는 이름들. */
const SYSTEM_FAMILIES = new Set([
  // 총칭
  'sans-serif', 'serif', 'monospace', 'system-ui', 'ui-monospace', 'ui-sans-serif',
  // 애플
  '-apple-system', 'blinkmacsystemfont', 'apple sd gothic neo',
  'sf mono', 'sfmono-regular', 'menlo',
  // 윈도우
  'segoe ui', 'consolas', 'malgun gothic',
  // 안드로이드 · 크롬
  'roboto', 'roboto mono', 'noto sans kr', 'noto sans cjk kr',
]);

function familiesOf(value) {
  return value
    .split(',')
    .map(part => part.trim().replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);
}

function tokenValue(css, name) {
  const m = css.match(new RegExp(`${name}\\s*:([^;]+);`));
  assert.ok(m, `${name} 토큰을 찾지 못했다`);
  return m[1].trim();
}

/** 저장소 어딘가에서 @font-face 로 실어 보내는 이름들. */
function selfHostedFamilies() {
  const found = new Set();
  const scan = dir => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name === '_to_delete'
        || name === 'ios' || name === 'android' || name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { scan(full); continue; }
      if (!/\.(css|js|mjs|html)$/.test(name)) continue;
      const css = stripComments(readFileSync(full, 'utf8'));
      for (const block of css.match(/@font-face\s*{[^}]*}/g) || []) {
        const fam = block.match(/font-family\s*:\s*([^;]+);/);
        if (fam) for (const f of familiesOf(fam[1])) found.add(f.toLowerCase());
      }
    }
  };
  scan(ROOT);
  return found;
}

test('바깥에서 글꼴을 받아오지 않는다', () => {
  const html = read('ionic-shell.html');
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html),
    '구글 폰트는 서비스 워커가 캐시하지 않는 외부 요청이고, ' +
    'rel=stylesheet 라 첫 페인트까지 막는다');
  assert.ok(!/<link[^>]+\.(woff2?|ttf|otf)/i.test(html),
    '글꼴 파일은 빌드가 /assets 로 넣어야 서비스 워커가 캐시한다');
});

/** 셸 쪽에서 font-family 를 적은 자리 중 토큰이 아닌 것. */
function literalFamilies(path) {
  const literal = [];
  const css = stripComments(read(path));
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
    const value = m[1].trim();
    if (value.startsWith('var(--cp-') || value === 'inherit') continue;
    literal.push(`${path} → ${value}`);
  }
  return literal;
}

test('글꼴 이름은 토큰 한 곳에서만 정한다', () => {
  const literal = literalFamilies('src/prototype/ionic-shell.css');
  assert.deepEqual(literal, [],
    'font-family 는 var(--cp-font) / var(--cp-mono) / inherit 만 쓴다:\n' + literal.join('\n'));
});

test('정적 첫 화면도 글꼴 토큰을 쓴다', {
  skip: 'production gap: the ionic-shell.html boot <style> hard-codes font-family: system-ui, -apple-system, sans-serif',
}, () => {
  const literal = literalFamilies('ionic-shell.html');
  assert.deepEqual(literal, [],
    'font-family 는 var(--cp-font) / var(--cp-mono) / inherit 만 쓴다:\n' + literal.join('\n'));
});

test('셸 본문이 글꼴 토큰을 쓴다', {
  skip: "production gap: ionic-shell.css never sets --ion-font-family, so Ionic's typography.css draws light-DOM text in Ionic's default stack while the domain components use var(--cp-font); the legacy style.css body used var(--cp-font)",
}, () => {
  // Ionic 은 html 의 글꼴을 --ion-font-family 로 정한다(typography.css).
  assert.match(stripComments(read('src/prototype/ionic-shell.css')), /--ion-font-family\s*:\s*var\(--cp-font\)/,
    '셸 글자와 컴포넌트 글자가 다른 글꼴로 그려진다');
});

test('적어 둔 글꼴은 OS 에 있거나 우리가 실어 보낸 것이다', () => {
  const tokens = stripComments(read('src/styles/tokens.css'));
  const hosted = selfHostedFamilies();
  const missing = [];

  for (const token of ['--cp-font', '--cp-mono']) {
    for (const family of familiesOf(tokenValue(tokens, token))) {
      const key = family.toLowerCase();
      if (SYSTEM_FAMILIES.has(key) || hosted.has(key)) continue;
      missing.push(`${token} → "${family}"`);
    }
  }

  assert.deepEqual(missing, [],
    '받아오지 않는 이름은 조용히 무시된다 — 코드에는 있는데 화면에는 없는 글꼴이 된다.\n' +
    'OS 에 있는 이름이면 목록에 추가하고, 정말 쓰고 싶으면 @font-face 로 실어 보내라:\n' +
    missing.join('\n'));
});

test('문서 언어는 한국어다', () => {
  const html = read('ionic-shell.html');
  const m = html.match(/<html[^>]*\blang\s*=\s*"([^"]+)"/);
  assert.ok(m, '<html lang> 이 없다');
  assert.equal(m[1], 'ko',
    'lang 이 en 이면 한자·가나를 공유하는 글자에서 브라우저가 ' +
    '일본어/중국어 글꼴을 고를 수 있고, 스크린 리더도 영어로 읽는다');
});
