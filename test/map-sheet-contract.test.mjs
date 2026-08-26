/**
 * 결과 화면을 "지도가 배경, 일정이 시트"로 바꾼 것에 대한 규칙.
 *
 * 보드의 방향 D 본체다. 앞서 팔레트와 상태바 색만 먼저 넣었고, 여기서
 * 레이아웃을 바꾼다. 지금까지는 지도(500px)와 일정이 위아래로 놓여
 * 스크롤을 공유했다 — 지도를 보려면 위로, 일정을 보려면 아래로. 둘을 함께
 * 보는 순간이 없어서 "경로 최적화"라는 이 제품의 핵심이 화면에서 보이지
 * 않았다.
 *
 * 시트는 접근성에서 쉽게 무너진다. 손잡이를 `<div>` 로 만들면 키보드로는
 * 영영 못 연다. 여기서 지키는 것 대부분이 그 이야기다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  stripComments, assertNoShadows, assertNoGradients, assertNoHardcodedColors,
  assertNoNamedColors, assertNoRgbaColors, assertNoModernColorFunctions,
  assertSquareRadius, assertNoLegacyTokens,
} from './helpers/style-contract.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const html = readFileSync(`${ROOT}index.html`, 'utf8');
const css = stripComments(readFileSync(`${ROOT}style.css`, 'utf8'));
const tokens = readFileSync(`${ROOT}src/styles/tokens.css`, 'utf8');
const main = readFileSync(`${ROOT}src/app/main.js`, 'utf8');
const sheetJs = readFileSync(`${ROOT}src/app/map-sheet.js`, 'utf8');

/** style.css 에서 이 화면에만 해당하는 규칙들. */
const stageCss = css
  .split(/\n(?=[.#@:a-zA-Z])/)
  .filter(block => /map-sheet|sheet-grip|sheet-body|#page-view|stage-map/.test(block))
  .join('\n');

/** 한 셀렉터의 선언 블록. */
function block(selector) {
  const re = new RegExp(`${selector.replace(/[.#[\]="]/g, m => '\\' + m)}\\s*\\{([^}]*)\\}`);
  const m = re.exec(css);
  assert.ok(m, `${selector} 규칙이 없다`);
  return m[1];
}

test('일정이 지도 위의 시트가 된다', () => {
  const view = /<div id="page-view"[\s\S]*?<\/div>\s*<\/section>/.exec(html);
  assert.ok(view, '#page-view 를 찾지 못했다');
  const markup = view[0];
  assert.match(markup, /<map-view><\/map-view>/, '지도가 없다');
  assert.match(markup, /id="itinerary-sheet"/, '시트 감싸개가 없다');
  // 시트가 일정을 품어야 한다 — 형제로 두면 시트를 내려도 일정이 남는다.
  const sheet = /<div id="itinerary-sheet"[\s\S]*?<itinerary-view><\/itinerary-view>/.exec(markup);
  assert.ok(sheet, '<itinerary-view> 가 시트 안에 있지 않다');
});

test('손잡이는 진짜 버튼이다 — 키보드로도 열린다', () => {
  const grip = /<button[^>]*class="[^"]*sheet-grip[^"]*"[\s\S]*?>/.exec(html);
  assert.ok(grip, '손잡이가 <button> 이 아니다. <div> 로 만들면 키보드로 영영 못 연다');
  assert.match(grip[0], /aria-expanded=/, '펼침 상태를 알리지 않는다');
  assert.match(grip[0], /aria-controls=/, '무엇을 여는 버튼인지 알리지 않는다');
});

test('JS 가 죽어도 일정은 보인다', () => {
  // 마크업의 기본 상태가 접힘이면, 스크립트가 실패한 순간 사용자는 손잡이만
  // 있는 빈 지도를 보게 된다. 기본은 펼침이고 JS 가 접는다.
  const sheet = /<div id="itinerary-sheet"[^>]*>/.exec(html);
  assert.ok(sheet, '시트를 찾지 못했다');
  assert.match(sheet[0], /data-state="full"/,
    '기본 상태가 펼침이어야 한다 — 접힘이면 JS 실패가 곧 빈 화면이다');
});

test('시트는 뒤가 비치지 않는다', () => {
  // 이 방향에는 그림자가 없다. 지도와 일정을 가르는 것은 실선 한 겹과
  // 불투명한 지면색뿐이라, 반투명이면 글자와 지도가 겹쳐 둘 다 안 읽힌다.
  const body = block('.map-sheet');
  assert.match(body, /background\s*:\s*var\(--cp-paper\)/, '불투명한 지면색이 필요하다');
  assert.match(body, /border-top\s*:/, '지도와의 경계가 없다');
});

test('드래그는 손잡이에서만 잡는다', () => {
  // 시트 전체에 touch-action: none 을 걸면 안쪽 목록을 손가락으로 굴릴 수 없다.
  assert.match(block('.sheet-grip'), /touch-action\s*:\s*none/,
    '손잡이에서 드래그를 잡지 않는다');
  assert.ok(!/touch-action\s*:\s*none/.test(block('.sheet-body')),
    '.sheet-body 까지 막으면 일정을 스크롤할 수 없다');
});

test('접힌 동안에는 안쪽이 스크롤되지 않는다', () => {
  assert.match(stageCss, /\[data-state="peek"\][^{]*\.sheet-body\s*\{[^}]*overflow\s*:\s*hidden/,
    '접힌 채로 안쪽만 굴러가면 손잡이가 제자리에서 떠는 것처럼 보인다');
});

test('넓은 화면에서는 시트가 아니라 옆 패널이다', () => {
  // 노트북에서 아래에서 올라오는 시트는 자리를 낭비하고 어색하다.
  // 데모를 노트북으로 하는 것을 생각하면 이쪽이 더 자주 보인다.
  assert.match(stageCss, /@media[^{]*min-width[^{]*\{[\s\S]*?\.map-sheet/,
    '넓은 화면 대응이 없다');
});

test('지도 위의 버튼이 시트를 덮지 않는다', () => {
  // 이 버튼은 지도 위에 떠 있는 것이지 시트 위에 떠 있는 것이 아니다.
  // 시트보다 위에 두면 펼쳤을 때 그 안의 일차 탭을 덮는다 — 폰에서
  // 실제로 그렇게 겹쳐 있었다.
  const actions = block('#page-view .view-actions');
  const sheet = block('.map-sheet');
  const z = css => Number((/z-index\s*:\s*(-?\d+)/.exec(css) || [])[1]);
  assert.ok(Number.isFinite(z(actions)), '.view-actions 에 z-index 가 없다');
  assert.ok(Number.isFinite(z(sheet)), '.map-sheet 에 z-index 가 없다');
  assert.ok(z(actions) < z(sheet),
    `지도(0) < 버튼(${z(actions)}) < 시트(${z(sheet)}) 순서라야 접었을 땐 보이고 펼치면 덮인다`);
});

test('지도의 z-index 가 시트 위로 새지 않는다', () => {
  // position:absolute + z-index:auto 는 쌓임 맥락을 만들지 않는다. 그래서
  // 지도 안의 로딩 막(z-index: 20)이 무대의 쌓임 맥락에 그대로 참여해
  // 시트(z-index: 2) 위를 덮었다 — 손잡이가 보이는데 눌리지 않았다.
  const map = block('#page-view > map-view');
  assert.match(map, /isolation\s*:\s*isolate/,
    '지도가 자기 쌓임 맥락을 만들지 않으면 안쪽 z-index 가 시트를 덮는다');
});

test('무대는 flex 사슬이 끊겨도 사라지지 않는다', () => {
  // 무대의 자식(지도·시트)은 전부 절대 배치라 내용으로 높이를 버텨 주지
  // 않는다. min-height 가 0 이면 사슬 한 마디만 어긋나도 결과 화면이
  // 통째로 빈다 — 랜딩이 빈 화면이 되던 것과 같은 종류의 사고다.
  const body = block('body.stage-map #page-view');
  // flex 안에서는 min-height: 0 이어야 화면보다 커지지 않는다. 그래서
  // 바닥값은 height 가 맡는다 — flex 컨테이너가 아닐 때만 쓰이는 값이다.
  const floor = /(?:^|[^-])height\s*:\s*([^;]+)/.exec(body.replace(/min-height\s*:[^;]+;/g, ''));
  assert.ok(floor, '무대에 바닥값(height)이 없다');
  assert.ok(!/^0(px)?$/.test(floor[1].trim()),
    `무대 바닥값이 0 이다(${floor[1].trim()}) — flex 가 안 먹는 순간 화면이 빈다`);
  assert.match(floor[1], /vh|px/, '뷰포트를 기준으로 한 바닥값이어야 한다');
});

test('보임·숨김을 인라인 display 로 하지 않는다', () => {
  // 인라인 style 은 어떤 CSS 규칙도 이긴다. 실제로 main.js 가 .content 에
  // display:block 을 박아 두는 바람에, 결과 화면에서 그 상자를 flex 로 만들
  // 수가 없었다 — 무대가 남은 높이를 못 받고 바닥값에 머물렀다.
  // 브라우저에서 직접 재 보기 전까지 테스트도 눈도 잡지 못한 자리다.
  assert.ok(!/appContent\.style\.display/.test(main),
    '.content 의 display 를 인라인으로 정하면 화면마다 다른 배치를 줄 수 없다');
  assert.match(main, /appContent\.hidden\s*=/, 'hidden 속성으로 감추지 않는다');
  assert.match(css, /\.content\[hidden\]\s*\{[^}]*display\s*:\s*none/,
    '.content[hidden] 규칙이 없으면 hidden 이 무시된다');
});

test('넓은 화면에서 액자가 가운데 온다', () => {
  const rules = [...css.matchAll(/body\.stage-map\s*\{([^}]*)\}/g)].map(m => m[1]).join('\n');
  assert.match(rules, /place-items\s*:\s*stretch\s+center/,
    'stretch 만 주면 액자가 왼쪽에 붙고 오른쪽에 빈 지면이 남는다');
});

test('무대에서는 액자 여백을 걷는다', () => {
  assert.match(main, /stage-map/, '결과 화면에서 무대 표시를 붙이지 않는다');
  assert.match(css, /body\.stage-map\s+\.content(?::not\(\[hidden\]\))?\s*\{[^}]*padding\s*:\s*0/,
    '지도가 배경인데 안쪽 여백이 남으면 지도가 액자 속 카드로 보인다');
});

test('지도는 고정 높이가 아니라 무대를 채운다', () => {
  // 500px 로 못박혀 있으면 무대가 아무리 커도 지도는 그만큼만 그려지고,
  // 남는 자리는 빈 지면으로 남는다.
  const mapView = readFileSync(`${ROOT}src/domains/map/ui/map-view.js`, 'utf8');
  const host = /:host\s*\{([^}]*)\}/.exec(mapView);
  assert.ok(host, 'map-view 의 :host 를 찾지 못했다');
  assert.match(host[1], /height\s*:\s*100%/, '무대 높이를 따라가지 않는다');
  assert.ok(!/min-height\s*:\s*\d+px/.test(host[1]), '고정 최소 높이가 남아 있다');
  const container = /#map-container\s*\{([^}]*)\}/.exec(mapView);
  assert.match(container[1], /height\s*:\s*100%/, '지도 상자가 고정 높이다');
});

test('시트도 같은 형태 규칙을 지킨다', () => {
  const LABEL = 'map-sheet';
  assertNoShadows(stageCss, LABEL);
  assertNoGradients(stageCss, LABEL);
  assertNoHardcodedColors(stageCss, LABEL);
  assertNoNamedColors(stageCss, LABEL);
  assertNoRgbaColors(stageCss, LABEL);
  assertNoModernColorFunctions(stageCss, LABEL);
  assertSquareRadius(stageCss, LABEL, tokens);
  assertNoLegacyTokens(stageCss, LABEL);
});

test('손가락으로도 잡을 수 있는 손잡이', () => {
  assert.match(stageCss, /@media\s*\([^)]*pointer:\s*coarse[^)]*\)[\s\S]*?\.sheet-grip[^}]*min-height\s*:\s*(4[4-9]|[5-9]\d)px/,
    '손잡이가 손가락 크기(44px)를 넘지 않는다');
});

test('드래그 중에는 애니메이션을 끈다', () => {
  // 손가락을 따라오는 값에 transition 이 걸려 있으면 한 박자씩 늦게 붙는다.
  assert.match(stageCss, /\.map-sheet\[data-dragging="true"\]\s*\{[^}]*transition\s*:\s*none/,
    '끌고 있는 동안 transition 을 끄지 않는다');
});

test('시트 로직은 시계나 난수를 읽지 않는다', () => {
  // 속도 판단에 Date.now() 를 쓰면 테스트가 시간에 의존한다.
  // 이벤트가 주는 timeStamp 로 충분하다.
  assert.ok(!/Math\.random/.test(sheetJs), '난수를 쓴다');
  assert.match(sheetJs, /timeStamp/, '이벤트의 timeStamp 대신 다른 시계를 쓰고 있지 않은지 확인');
});

/**
 * 손잡이 글자는 **쓸 때마다 다시 읽어야 한다.**
 *
 * 맥에서 언어를 영어로 돌려 보고 잡았다. 사전에는 `sheetExpand`/`sheetCollapse`
 * 가 있는데도 손잡이만 "일정 펼치기"로 남아 있었다 — `initMapSheet` 이 초기화
 * 때 `t()` 를 **한 번만** 읽어 글자를 박아 두었기 때문이다. 사전을 바꾸는 것으로는
 * 이미 박힌 글자를 되돌릴 수 없다. 지도 여백(`getFrameInsets`)에서 배운 것과
 * 같은 교훈이라 같은 모양으로 고쳤다.
 */
test('손잡이 글자는 함수로 받아 쓸 때마다 읽는다', () => {
  assert.match(
    sheetJs,
    /typeof labels === 'function'/,
    '값으로 받아 두면 언어가 바뀐 뒤에는 틀린 글자다'
  );
  assert.match(
    sheetJs,
    /addEventListener\?\.\(\s*'i18n-changed'|addEventListener\(\s*'i18n-changed'/,
    '언어가 바뀌면 지금 상태의 글자를 다시 써야 한다'
  );
});

test('앱은 손잡이 글자를 함수로 넘긴다', () => {
  assert.match(main, /labels:\s*\(\s*\)\s*=>/, 'main.js 가 아직 값으로 넘기고 있다');
});
