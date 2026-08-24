/**
 * 결과 화면의 조작 묶음 — 손가락이 닿는 자리에 관한 규칙.
 *
 * 이 화면은 하루치 일정이 세로로 길게 이어진다. 그런데 "이 일정 저장하기"가
 * 그 **맨 끝**에 있었다. 만든 일정을 저장하려면 하루를 전부 스크롤해서
 * 내려가야 했다는 뜻이다. 보드의 작업 순서 2번이 "주 버튼을 하단 고정 +
 * env(safe-area-inset-bottom)" 이라고 적어 둔 것이 이것이다.
 *
 * 함께 지키는 것 하나 더 — **들어올리기로 상태를 말하지 않는다.**
 * 이 방향에는 그림자가 없다. 그림자 없이 2px 올라가기만 하면 떠오르는
 * 것이 아니라 그냥 흔들리는 것으로 보이고, 손가락 기기에는 hover 자체가
 * 없어서 그 노력이 아무에게도 닿지 않는다. 상태는 잉크 반전이나 테두리로
 * 말한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { itineraryStyles } from '../src/domains/itinerary/ui/itinerary-style.js';
import { readFileSync } from 'node:fs';
import { stripComments, stripSourceComments, assertTouchTargets } from './helpers/style-contract.mjs';

const css = stripComments(itineraryStyles);
const view = stripSourceComments(
  readFileSync(new URL('../src/domains/itinerary/ui/itinerary-view.js', import.meta.url), 'utf8'));

/** 한 셀렉터의 선언 블록을 떼어 온다. */
function block(selector) {
  const re = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`);
  const m = re.exec(css);
  assert.ok(m, `${selector} 규칙이 없다`);
  return m[1];
}

test('주 버튼이 엄지가 닿는 자리에 머문다', () => {
  const body = block('.actions-primary');
  assert.match(body, /position\s*:\s*sticky/, '스크롤을 따라오지 않으면 맨 끝까지 내려가야 한다');
  assert.match(body, /bottom\s*:\s*0/, '아래쪽에 붙지 않는다');
});

test('홈 인디케이터 아래로 버튼이 숨지 않는다', () => {
  const body = block('.actions-primary');
  assert.match(body, /env\(safe-area-inset-bottom/,
    'iPhone 홈 인디케이터·안드로이드 제스처 바 자리를 비켜 줘야 한다');
});

test('머무는 막대는 뒤가 비치지 않는다', () => {
  // 반투명이면 밑으로 지나가는 일정이 글자와 겹쳐 둘 다 읽히지 않는다.
  const body = block('.actions-primary');
  assert.match(body, /background\s*:\s*var\(--cp-[a-z-]+\)/, '불투명한 지면색이 필요하다');
  assert.match(body, /border-top\s*:/, '아래로 지나가는 내용과 경계가 필요하다');
});

test('조작 묶음의 배치는 CSS 에 있다', () => {
  // 예전에는 이 묶음이 마크업의 style="display: flex; …" 였다. 배치가
  // 로직 파일에 박히면 스타일 계약이 지나가고, 화면마다 갈라진다.
  assert.match(css, /\.itinerary-actions\s*\{/, '.itinerary-actions 규칙이 없다');
  const markup = /<div[^>]*class="itinerary-actions"[^>]*>/.exec(view);
  assert.ok(markup, 'class="itinerary-actions" 를 쓰는 자리가 없다');
  assert.ok(!/style\s*=/.test(markup[0]),
    `조작 묶음에 인라인 스타일이 남아 있다: ${markup[0]}`);
});

test('주 버튼 상자는 조작 묶음 밖에 있다', () => {
  // sticky 요소는 부모 상자를 벗어나지 못한다. 조작 묶음(.itinerary-actions)
  // 안에 두면 미끄러질 자리가 버튼 한 개 높이뿐이라, sticky 를 적어 놔도
  // 아무 일도 일어나지 않는다 — 실제로 처음에 그렇게 넣었다가 걸렸다.
  const group = /<div class="itinerary-actions">([\s\S]*?)<\/div>/.exec(view);
  assert.ok(group, '.itinerary-actions 묶음을 찾지 못했다');
  assert.ok(!group[1].includes('actions-primary'),
    '주 버튼 상자가 조작 묶음 안에 들어가 있다 — 그러면 sticky 가 동작하지 않는다');
});

test('조작 버튼도 손가락 크기를 지킨다', () => {
  assertTouchTargets(css, 'itinerary-actions',
    ['.save-btn', '.share-btn', '.download-btn', '.kakao-share-btn']);
});

test('들어올리기로 상태를 말하지 않는다', () => {
  // 그림자가 없는 방향에서 2px 올라가기만 하면 떠오르는 게 아니라 흔들린다.
  // 게다가 손가락 기기에는 hover 가 없어서 아무에게도 닿지 않는다.
  const lifts = css.match(/transform\s*:\s*(translateY\(-[\d.]+|scale\(1\.[1-9])/g) || [];
  assert.deepEqual(lifts, [],
    '상태는 잉크 반전이나 테두리로 말한다\n' + [...new Set(lifts)].join('\n'));
});
