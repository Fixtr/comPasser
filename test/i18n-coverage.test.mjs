/**
 * 영어로 바꾸면 앱이 **전부** 바뀌어야 한다.
 *
 * 맥의 실제 브라우저에서 언어를 영어로 돌려 보고 잡은 것이다. 헤더만 영어가
 * 되고 본문은 한국어로 남았다 — 랜딩과 로그인은 `data-i18n` 이 **0개**였고,
 * 선호 화면은 33개 중 23개가, 결과 화면은 버튼 넷과 라벨 넷이 그대로였다.
 * 심사위원이 처음 보는 두 화면이 통째로 그랬다.
 *
 * 사람 눈으로는 잡기 어렵다 — 한국어로 개발하면 영어 화면을 볼 일이 없다.
 * 그래서 규칙 하나로 못박는다: **마크업 안의 한국어는 사전을 거쳐야 한다.**
 *
 * 이 저장소의 어법은 이렇다(첫 그림은 `t()` 가, 이후 전환은 속성이 맡는다):
 *
 *     <span data-i18n="date_weekend">${t('date_weekend')}</span>
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

/** 마크업을 담은 파일들 — 사용자가 읽는 글자가 여기서 나온다. */
const MARKUP_FILES = [
  'index.html',
  'src/domains/auth/ui/login-view.js',
  'src/domains/auth/ui/join-view.js',
  'src/domains/planner/ui/preference-view.js',
  'src/domains/planner/ui/travel-form.js',
  'src/domains/itinerary/ui/itinerary-view.js',
  'src/domains/auth/ui/verify-view.js',
  'src/domains/profile/ui/profile-view.js',
];

/** 마크업이 아니라 **코드가 직접 써 넣는** 글자가 있는 파일들. */
const SCRIPTED_FILES = [
  'src/app/main.js',
  'src/domains/auth/ui/login-view.js',
  'src/domains/auth/ui/join-view.js',
  'src/domains/auth/ui/verify-view.js',
  'src/domains/planner/ui/preference-view.js',
  'src/domains/planner/ui/travel-form.js',
  'src/domains/itinerary/ui/itinerary-view.js',
  'src/domains/profile/ui/profile-view.js',
];

/**
 * 언어 토글은 "지금 언어"가 아니라 "누르면 갈 언어"를 말한다(테마 토글과 같은
 * 규칙). 그래서 한국어 화면에서 "English", 영어 화면에서 "한국어"가 맞다 —
 * 자기 자신을 번역하면 안 되는 유일한 자리다.
 */
const EXEMPT_LINE = /id="lang-toggle"/;

/**
 * 주석을 지우되 **줄 수는 유지한다.** 여러 줄 주석을 통째로 없애면 그 뒤의
 * 줄 번호가 전부 밀려, 실패 메시지가 엉뚱한 줄을 가리킨다(처음에 그렇게 만들어
 * 놓고 파일을 열어 보고서야 알았다). 알려 주는 자리가 틀리면 안 알려 주느니만 못하다.
 */
const blankOut = (match) => match.replace(/[^\n]/g, ' ');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, blankOut)
  // `\s*` 로 쓰면 `\s` 가 줄바꿈까지 먹어 앞줄들이 통째로 사라진다(그래서 줄 번호가 40줄 밀렸다).
  .replace(/^[^\S\n]*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, blankOut);

/**
 * 마크업이 있는 자리를 정확히 집어낸다.
 *
 * 세 번 헛디뎠다.
 *  ① 파일 전체를 훑었더니 코드의 `<`/`>` 가 비교 연산자라 그 사이의 코드가
 *     통째로 "글자"로 읽혔다.
 *  ② 템플릿 밖을 공백으로 바꾸고 한 번에 훑었더니, `` `duration_${days}` `` 같은
 *     코드용 템플릿이 남아 **서로 다른 덩어리의** `>` 와 `<` 가 짝을 지었다.
 *  ③ `${...}` 를 통째로 지웠더니 그 **안에 든 마크업**(조건부 렌더링,
 *     `.map()` 안의 조각)이 통째로 검사 밖으로 빠졌다 — 실제로 "길찾기"·"리뷰보기"가
 *     그렇게 숨어 있었다.
 *
 * 그래서 원본과 **길이가 같은 가면**을 만든다: 템플릿의 글자 부분만 남기고
 * 나머지는 공백(줄바꿈은 그대로)으로 덮는다. 길이가 같으니 줄 번호가 정확하고,
 * 덩어리 범위를 따로 들고 있으니 덩어리를 넘나드는 짝짓기도 생기지 않는다.
 * `${...}` 안의 템플릿은 재귀로 들어가 **그 자체가 하나의 덩어리**가 된다.
 */
function maskTemplates(source) {
  // `[...source]` 는 코드 포인트 단위라 이모지 하나가 한 칸이 되는데, 아래 반복문은
  // UTF-16 단위로 센다. 그 어긋남 때문에 줄 번호가 12줄 밀렸다(파일에 이모지가 있다).
  const mask = source.split('').map(ch => (ch === '\n' ? '\n' : ' '));
  const ranges = [];
  const n = source.length;

  const readTemplate = (start) => {
    let i = start + 1;
    while (i < n) {
      const ch = source[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === '`') { ranges.push([start + 1, i]); return i + 1; }
      if (ch === '$' && source[i + 1] === '{') { i = skipExpression(i + 2); continue; }
      if (ch !== '\n') mask[i] = ch;
      i += 1;
    }
    ranges.push([start + 1, n]);
    return n;
  };

  const skipExpression = (from) => {
    let i = from;
    let depth = 1;
    while (i < n && depth > 0) {
      const ch = source[i];
      if (ch === '`') { i = readTemplate(i); continue; }   // 표현식 안의 마크업도 본다
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    return i;
  };

  for (let i = 0; i < n; i += 1) {
    if (source[i] === '`') i = readTemplate(i) - 1;
  }
  return { masked: mask.join(''), ranges };
}

/**
 * 한 줄에서 `${...}` 를 걷어 낸다. 그 안은 `t()` 의 몫이라 검사 대상이 아니다.
 * 중첩된 템플릿 때문에 정규식으로는 못 걷어 내므로 중괄호를 센다.
 */
function stripExpressions(line) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (depth === 0 && ch === '$' && line[i + 1] === '{') { depth = 1; i += 1; continue; }
    if (depth > 0) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      continue;
    }
    out += ch;
  }
  return out;
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/**
 * 규칙: **한국어 글자를 감싸는 바로 그 여는 태그**가 `data-i18n` 을 달고 있어야 한다.
 *
 * 부모까지 거슬러 올라가며 봐주지 않는 것은 일부러다. 아이콘과 글자가 한 버튼에
 * 섞여 있을 때 부모에 키를 달면, 번역이 `textContent` 를 통째로 갈아 **아이콘을
 * 지운다.** 글자에는 글자만 감싸는 태그를 주라는 뜻이다:
 *
 *     <button><svg …/><span data-i18n="loginWithKakao">카카오로 시작하기</span></button>
 */
function untranslated(source, isHtml) {
  const clean = stripComments(source);
  const { masked, ranges } = isHtml
    ? { masked: clean, ranges: [[0, clean.length]] }
    : maskTemplates(clean);

  const found = [];
  for (const [from, to] of ranges) {
    const chunk = masked.slice(from, to);
    for (const m of chunk.matchAll(/>([^<>]*)</g)) {
      const body = m[1];
      if (!/[가-힣]/.test(body)) continue;
      const tagStart = chunk.lastIndexOf('<', m.index);
      const tag = tagStart < 0 ? '' : chunk.slice(tagStart, m.index + 1);
      if (/data-i18n/.test(tag) || EXEMPT_LINE.test(tag)) continue;
      found.push(`${lineAt(masked, from + m.index)}: ${body.trim().slice(0, 52)}   ← ${tag.trim().slice(0, 52)}`);
    }
    // 속성 안의 한국어(placeholder·title·aria-label)도 사용자가 읽는 글자다.
    for (const m of chunk.matchAll(/\b(placeholder|title|aria-label)="([^"]*[가-힣][^"]*)"/g)) {
      const tagStart = chunk.lastIndexOf('<', m.index);
      const tag = chunk.slice(tagStart, chunk.indexOf('>', m.index) + 1);
      if (/data-i18n-(placeholder|title|aria)/.test(tag)) continue;
      found.push(`${lineAt(masked, from + m.index)}: ${m[1]}="${m[2].slice(0, 40)}"`);
    }
  }
  return [...new Set(found)].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

for (const file of MARKUP_FILES) {
  test(`${file} — 마크업 안의 한국어가 전부 사전을 거친다`, () => {
    const lines = untranslated(read(file), file.endsWith('.html'));
    assert.deepEqual(lines, [],
      `영어로 바꿔도 한국어로 남는 자리 ${lines.length}곳:\n` + lines.join('\n'));
  });
}

test('쓰이는 data-i18n 키가 두 사전에 모두 있다', () => {
  const i18n = read('src/utils/i18n.js');
  const keys = new Set();
  for (const file of [...MARKUP_FILES, 'src/app/main.js']) {
    const source = stripComments(read(file));
    for (const m of source.matchAll(/data-i18n(?:-placeholder|-aria|-title)?=["']([a-zA-Z0-9_]+)["']/g)) {
      keys.add(m[1]);
    }
  }
  assert.ok(keys.size > 20, `키를 ${keys.size}개밖에 못 찾았다 — 정규식이 안 맞는 것 같다`);
  const missing = [...keys].filter(key => (i18n.match(new RegExp(`^\\s{8}${key}\\s*:`, 'gm')) || []).length !== 2);
  assert.deepEqual(missing, [],
    '두 사전에 모두 있어야 한다 — t() 는 없는 키를 만나면 키 이름을 그대로 화면에 찍는다:\n' + missing.join('\n'));
});

/**
 * 마크업만 보면 절반만 본 것이다.
 *
 * 사용자가 실제 화면에서 잡아 준 것이 이 종류였다 — 종료 시각 경고 문장이
 * 영어 화면에 한국어로 떠 있었는데, 그 글자는 마크업이 아니라
 * `document.createTextNode(\` 실제 이동시간을 …\`)` 로 **코드가 직접** 만들고
 * 있었다. 마크업만 훑는 검사에는 통째로 안 보인다.
 *
 * 그래서 글자를 화면에 써 넣는 자리(`textContent`·`innerText`·`innerHTML`·
 * `createTextNode`·`setAttribute('aria-label'|'title'|'placeholder')`)에 한국어
 * 리터럴이 있으면 걸러 낸다. `t(` 가 같은 줄에 있으면 사전을 거친 것으로 본다.
 */
// Toasts are written text too: English users saw Korean login errors through them.
const WRITE_SITES = /(createTextNode|textContent|innerText|innerHTML|\.setAttribute\(\s*['"](?:aria-label|title|placeholder)['"]|show(?:Error|Success)?Toast\()/;

function scriptedKorean(source) {
  const found = [];
  stripComments(source).split('\n').forEach((line, index) => {
    if (!WRITE_SITES.test(line)) return;
    if (/\bt\(/.test(line)) return;              // 사전을 거치는 줄
    if (EXEMPT_LINE.test(line)) return;
    if (/langToggleBtn\.textContent/.test(line)) return;  // 토글은 자기 자신을 번역하지 않는다
    const bare = stripExpressions(line);
    if (/[가-힣]/.test(bare)) found.push(`${index + 1}: ${line.trim().slice(0, 76)}`);
  });
  return found;
}

for (const file of SCRIPTED_FILES) {
  test(`${file} — 코드가 써 넣는 글자도 사전을 거친다`, () => {
    const lines = scriptedKorean(read(file));
    assert.deepEqual(lines, [],
      `영어로 바꿔도 한국어로 남는 자리 ${lines.length}곳:\n` + lines.join('\n'));
  });
}
