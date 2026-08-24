/**
 * 아이콘 마크업이 글자로 새어 나오는 것을 막는다.
 *
 * `src/ui/icons.js` 의 아이콘은 `<svg ...>` **문자열**이다. 이걸 글자와
 * 한 덩어리로 이어 붙여 `textContent` 에 넣으면 브라우저는 태그를 태그로
 * 읽지 않고 글자 그대로 찍는다. 화면에는 `<svg viewBox="0 0 16 16" ...>`
 * 가 그대로 보인다.
 *
 * 실제로 그렇게 깨졌다. 결과 화면의 "지도에서 찾은 곳" 줄은 원래 🔎
 * 이모지를 쓰고 있었는데(이모지는 글자라서 textContent 로도 멀쩡했다),
 * 장식 이모지를 인라인 SVG 로 바꾸면서 `textContent` 자리는 그대로 뒀다.
 *
 * 이 실수는 기존 검사 어느 것도 잡지 못한다 — CSS 계약은 스타일만 보고,
 * 순수 로직 테스트는 문자열만 본다. 화면을 그려 봐야 보이는데, 이 줄은
 * 지도가 장소를 찾아 준 뒤에만 나타나서 픽스처로는 재현되지 않는다.
 * 그래서 소스를 직접 훑는다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { stripSourceComments } from './helpers/style-contract.mjs';

const SRC = new URL('../src/', import.meta.url).pathname;

function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.(js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * `.textContent = ...;` 한 문장을 통째로 떼어 온다.
 *
 * 정규식으로 `;` 까지 자르면 템플릿 리터럴 안의 `;` 에서 끊긴다. 그래서
 * 따옴표·백틱·`${}` 상태를 세면서 앞으로 읽는다.
 */
function readAssignment(source, from) {
  let i = from;
  let quote = null;      // 지금 열려 있는 따옴표
  let tmpl = 0;          // 백틱 안 `${}` 깊이
  while (i < source.length) {
    const c = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (c === quote && prev !== '\\') quote = null;
      else if (quote === '`' && c === '$' && source[i + 1] === '{') { tmpl++; i++; }
      else if (quote === '`' && c === '}' && tmpl > 0) tmpl--;
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c;
    } else if (c === ';' || c === '\n') {
      if (c === ';') return source.slice(from, i);
      // 줄바꿈은 세미콜론 없이 끝나는 문장을 위해 남겨 두되, 문장이 이어지면 계속 읽는다.
      const rest = source.slice(from, i).trim();
      if (rest && !/[+,({[?:=]$/.test(rest)) return rest;
    }
    i++;
  }
  return source.slice(from);
}

const MARKUP = /<\/?[a-zA-Z][\s\S]*?>|\bicons\s*\./;

test('아이콘 마크업은 textContent 로 들어가지 않는다', () => {
  const offenders = [];

  for (const file of collect(SRC)) {
    const source = stripSourceComments(readFileSync(file, 'utf8'));
    const re = /\.(textContent|innerText)\s*=/g;
    let m;
    while ((m = re.exec(source))) {
      const statement = readAssignment(source, m.index + m[0].length);
      if (!MARKUP.test(statement)) continue;
      const line = source.slice(0, m.index).split('\n').length;
      offenders.push(`${file.replace(SRC, 'src/')}:${line} → ${statement.trim().slice(0, 100)}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    '아이콘·태그는 textContent 로 넣으면 글자 그대로 찍힌다. ' +
    '아이콘은 innerHTML 로, 글자는 textContent 로 나눠 담아라(ui/icons.js 의 iconRow):\n' +
    offenders.join('\n')
  );
});
