import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { stripSourceComments, stripComments } from './helpers/style-contract.mjs';

/**
 * 옛 토큰(`--bg-primary` 계열)이 완전히 사라졌는지 확인한다.
 *
 * 화면을 하나씩 옮기는 동안 `--cp-*` 와 옛 변수가 나란히 살아 있었다.
 * 둘이 공존하는 상태에서는 "이 색이 어디서 오는가"에 답이 둘이라, 새 화면이
 * 실수로 옛 쪽을 읽어도 아무도 눈치채지 못한다. 마지막 화면까지 옮겼으니
 * 정의 자체를 지우고, 다시 생기지 않도록 테스트로 막는다.
 */
const ROOT = new URL('../', import.meta.url).pathname;
const LEGACY_READ = /var\(\s*--(bg|text|accent|shadow|radius)-[a-z-]+/g;
// One-line rules put definitions after `{` or `;`, not at a line start.
const LEGACY_DEFINE = /(?:^|[{;])\s*--(bg|text|accent|shadow|radius)-[a-z-]+\s*:/gm;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs|css|html)$/.test(name)) out.push(full);
  }
  return out;
}

const FILES = [
  ...walk(join(ROOT, 'src')),
  join(ROOT, 'ionic-shell.html'),
];
/** 앱 층 스타일 — 토큰은 tokens.css 에서만 정의한다. */
const SHELL_CSS = join(ROOT, 'src/prototype/ionic-shell.css');

test('옛 토큰을 읽는 곳이 하나도 없다', () => {
  const offenders = [];
  for (const file of FILES) {
    const raw = readFileSync(file, 'utf8');
    const body = file.endsWith('.css') || file.endsWith('.html')
      ? stripComments(raw)
      : stripSourceComments(raw);
    const hits = body.match(LEGACY_READ);
    if (hits) offenders.push(`${file.replace(ROOT, '')}: ${[...new Set(hits)].join(', ')}`);
  }
  assert.deepEqual(offenders, [], `옛 토큰을 아직 읽는다\n${offenders.join('\n')}`);
});

test('옛 토큰의 정의가 남아 있지 않다', () => {
  const css = stripComments(readFileSync(SHELL_CSS, 'utf8'));
  const hits = css.match(LEGACY_DEFINE) || [];
  assert.deepEqual(hits.map(v => v.trim()), [],
    `ionic-shell.css 에 옛 변수 정의가 남아 있다\n${hits.join('\n')}`);
});

test('토큰 정의는 tokens.css 한 곳에만 있다', () => {
  // 같은 이름을 두 파일에서 정의하면 어느 쪽이 이기는지 로드 순서에 달린다.
  const style = stripComments(readFileSync(SHELL_CSS, 'utf8'));
  const defined = [...style.matchAll(/(?:^|[{;])\s*(--cp-[a-z0-9-]+)\s*:/gm)].map(m => m[1]);
  assert.deepEqual(defined, [], `ionic-shell.css 가 --cp-* 를 다시 정의한다: ${defined.join(', ')}`);
});
