import assert from 'node:assert/strict';

/**
 * 화면별 스타일 계약을 한 곳에 모은다.
 *
 * 결과 화면 · 공통 프레임 · 여행 폼이 같은 규칙을 따르는데, 파일마다 같은
 * 정규식을 다시 쓰면 규칙이 조용히 갈라진다(한쪽만 고치는 일이 생긴다).
 *
 * 규칙의 근거는 셋 다 같다 —
 *  1) 야외 가독성: 낯선 도시를 걸어다니는 사용자가 햇빛 아래에서 읽는다
 *  2) 렌더 비용: Capacitor 로 저사양 안드로이드에도 올라간다
 *  3) 캡처 호환: html2canvas 는 그림자·그라디언트·최신 색 함수를 못 읽는다
 *     (PRD 3.7 에 color(display-p3) 로 캡처가 깨진 이력이 있다)
 */

/** 주석을 지운 본문. 주석 속 예시를 위반으로 잡지 않기 위해. */
export function stripComments(source) {
  return String(source).replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * JS 파일을 검사할 때 쓴다. 블록 주석에 더해 **줄 맨 앞의** `//` 주석도 지운다.
 *
 * 필요한 이유: 이 계약들이 잡아낸 값을 주석으로 남겨 두는 일이 많다
 * ("예전에는 #10B981 이었는데 …"). 그 설명이 다시 위반으로 잡히면
 * 기록을 지우거나 테스트를 무디게 만드는 선택을 강요받는다.
 *
 * 줄 앞만 지우는 것은 의도적이다. 줄 끝의 `//` 까지 지우려면 문자열·정규식
 * 안의 `//`(예: https://)와 구분해야 하는데, 그건 파서가 할 일이다.
 * 값이 들어간 설명은 줄 앞 주석으로 쓰면 된다.
 */
export function stripSourceComments(source) {
  return stripComments(source)
    .split('\n')
    .map(line => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

export function assertNoShadows(css, label) {
  const hits = css.match(/box-shadow\s*:\s*(?!none)[^;]+/g) || [];
  assert.deepEqual(hits, [], `${label}: 그림자 대신 1px 실선으로 경계를 만든다\n${hits.join('\n')}`);
}

export function assertNoGradients(css, label) {
  const hits = css.match(/(linear|radial|conic)-gradient\(/g) || [];
  assert.deepEqual(hits, [], `${label}: 그라디언트는 캡처에서 사라진다 (${hits.length}건)`);
}

export function assertNoHardcodedColors(css, label) {
  const hits = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hits, [], `${label}: 색은 var(--cp-*) 에서 온다\n${[...new Set(hits)].join(', ')}`);
}

/**
 * 이름 있는 색(white/black/red …)도 토큰이 아니다.
 * `color: white` 는 라이트 모드에서만 맞고 다크 모드에서 흰 글씨에 흰 배경을
 * 만든다. hex 만 막으면 이쪽으로 새어 나간다.
 */
const NAMED_COLORS = ['white', 'black', 'red', 'blue', 'green', 'gray', 'grey', 'silver', 'yellow', 'orange', 'purple'];

export function assertNoNamedColors(css, label) {
  const hits = [];
  for (const name of NAMED_COLORS) {
    const re = new RegExp(`(?:^|[^-\\w])(?:color|background|background-color|border-color|fill|stroke)\\s*:\\s*${name}\\b`, 'gi');
    const found = css.match(re);
    if (found) hits.push(...found.map(v => v.trim()));
  }
  assert.deepEqual(hits, [], `${label}: 이름 있는 색 대신 var(--cp-*) 를 쓴다\n${[...new Set(hits)].join('\n')}`);
}

export function assertNoModernColorFunctions(css, label) {
  const hits = css.match(/\b(oklch|oklab|lch|lab|color-mix)\s*\(/g) || [];
  assert.deepEqual(hits, [], `${label}: html2canvas 가 읽지 못한다\n${[...new Set(hits)].join(', ')}`);
}

/**
 * 라운드는 0, --cp-radius(값이 0), --cp-pill 만 허용한다.
 * 토큰을 허용하되 그 값이 실제로 0 인지 함께 확인한다 — 값만 바뀌고
 * 테스트가 눈치채지 못하는 상황을 막는다.
 */
export function assertSquareRadius(css, label, tokensCss) {
  if (tokensCss) {
    const m = /--cp-radius\s*:\s*([^;]+);/.exec(tokensCss);
    assert.ok(m, '--cp-radius 토큰이 없다');
    assert.match(m[1].trim(), /^0(px)?$/, `--cp-radius 가 0 이 아니다: ${m[1].trim()}`);
  }
  const values = (css.match(/border-radius\s*:\s*[^;]+/g) || []).map(v => v.split(':')[1].trim());
  const bad = values.filter(v => !/^0(px)?$/.test(v) && !v.includes('--cp-pill') && !v.includes('--cp-radius'));
  assert.deepEqual(bad, [], `${label}: 각진 형태가 이 방향의 핵심이다\n${[...new Set(bad)].join('\n')}`);
}

/**
 * 옛 토큰(--bg-primary 계열)을 더 이상 읽지 않는지 확인한다.
 * 화면을 하나씩 옮기는 중이므로, 옮긴 화면은 --cp-* 만 봐야
 * 마지막에 옛 변수를 지울 수 있다.
 */
export function assertNoLegacyTokens(css, label) {
  const hits = css.match(/var\(\s*--(bg|text|accent|shadow|radius)-[a-z]+/g) || [];
  assert.deepEqual(hits, [], `${label}: 옛 토큰이 남아 있다\n${[...new Set(hits)].join(', ')}`);
}

/**
 * `:host` 에 box-sizing: border-box 가 있는지.
 *
 * 그림자 DOM 안의 `* { box-sizing: border-box }` 는 호스트에 닿지 않는다.
 * 그래서 `:host { width: 100%; padding: … }` 를 쓰면 여백만큼 화면 밖으로
 * 나가고, 폰에서 가로 스크롤이 생긴다. 선호 화면(32px)과 로그인 화면(42px)
 * 에서 각각 한 번씩 이 방식으로 새어 나갔다.
 */
export function assertHostBoxSizing(css, label) {
  const host = /:host\s*\{([^}]*)\}/.exec(css);
  assert.ok(host, `${label}: :host 블록이 없다`);
  const body = host[1];
  const needsIt = /width\s*:\s*100%/.test(body) && /padding\s*:/.test(body);
  if (!needsIt) return;
  assert.match(body, /box-sizing\s*:\s*border-box/,
    `${label}: :host 가 width:100% + padding 인데 box-sizing 이 없다`);
}

/**
 * 터치 기기에서 탭 대상이 44px 이상인지.
 * 데스크톱 밀도와 폰의 손가락은 서로 다른 요구라 포인터 종류로 가른다.
 */
export function assertTouchTargets(css, label, selectors) {
  const body = extractAtRuleBody(css, /@media\s*\([^)]*pointer:\s*coarse[^)]*\)\s*\{/);
  assert.ok(body !== null, `${label}: (pointer: coarse) 블록이 없다`);
  for (const sel of selectors) {
    // 셀렉터 목록에서 정확히 그 이름이 나오는지 본다. '.reset-btn' 이
    // '.reset-btn-x' 안에 들어 있는 것을 통과시키지 않기 위해서다.
    const found = new RegExp(`(^|[\\s,{])${sel.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}(?=[\\s,{:])`, 'm').test(body);
    assert.ok(found, `${label}: ${sel} 의 탭 대상이 넓혀지지 않았다`);
  }
  const sizes = [...body.matchAll(/min-(?:height|width)\s*:\s*(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(sizes.length > 0, `${label}: min-height/min-width 로 크기를 보장해야 한다`);
  assert.ok(sizes.every(v => v >= 44), `${label}: 44px 미만이 있다 (${sizes.filter(v => v < 44).join(', ')})`);
}

/**
 * 브라우저가 직접 그리는 위젯(시간·날짜 입력의 아이콘, select 화살표,
 * 스크롤바)은 우리 토큰을 보지 않는다. color-scheme 을 테마와 함께 뒤집지
 * 않으면 다크 모드에서 어두운 아이콘이 어두운 배경에 찍혀 사라진다.
 */
export function assertNativeControlScheme(tokensCss) {
  assert.match(
    tokensCss,
    /:root\s*\{[^}]*color-scheme\s*:\s*light/,
    '기본(:root) 에 color-scheme: light 가 없다'
  );
  assert.match(
    tokensCss,
    /body\.dark\s*\{[^}]*color-scheme\s*:\s*dark/,
    'body.dark 에 color-scheme: dark 가 없다'
  );
}

/**
 * 중첩 규칙이 있는 @media 블록의 본문을 중괄호를 세어 잘라낸다.
 * 정규식으로 끝을 찾으면 첫 번째 내부 규칙의 } 에서 멈춰 버려,
 * 뒤쪽 셀렉터가 빠져 있어도 테스트가 통과한다.
 */
function extractAtRuleBody(css, openRe) {
  const m = openRe.exec(css);
  if (!m) return null;
  let depth = 1;
  const start = m.index + m[0].length;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start, i);
    }
  }
  return null;
}
