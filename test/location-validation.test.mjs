/**
 * "시간만 넣고 장소를 하나도 안 넣었는데 동선이 생성된다."
 *
 * 배포본에서 사용자가 잡아 준 결함이다. 원인은 한 줄로 요약된다:
 * **아무도 장소를 안 본다.**
 *
 *   ① `<gmp-place-autocomplete>` 는 커스텀 엘리먼트라 폼에 참여하지 않는다.
 *      `required` 를 붙여도 브라우저 기본 검사는 이 칸을 아예 못 본다.
 *      (날짜·시작·종료 시각은 진짜 <input> 이라 막힌다 — 그래서 시간만
 *      빠뜨렸을 때는 멀쩡히 막혔고, 장소만 빠뜨렸을 때는 통과했다.)
 *   ② 제출 핸들러도 날짜·시간·고정 일정만 검사하고 장소는 건너뛴다.
 *
 * 통과한 뒤가 더 나쁘다. 빈 채로 흘러가면 —
 *   · functions/itinerary-prompt.js 는 AI 에게 출발지를 **"Unknown"** 이라고 말하고
 *   · planner-constraints.mjs 의 경계 보정(`if (startLocation)`)이 통째로 꺼지며
 *   · gemini-fallback.mjs 는 조용히 **"Seoul, South Korea"** 로 바꿔 버린다.
 * PRD 가 약속한 "경로 경계 무결성"이 소리 없이 사라지는 것이다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { findMissingLocation, REQUIRED_LOCATIONS } from '../src/domains/planner/services/location-validation.mjs';

test('둘 다 채워져 있으면 막지 않는다', () => {
  assert.equal(findMissingLocation({
    startLocation: '인천국제공항',
    endLocation: '서울역'
  }), null);
});

test('시작 장소가 비면 시작 장소를 가리킨다', () => {
  const missing = findMissingLocation({ startLocation: '', endLocation: '서울역' });
  assert.equal(missing?.key, 'startLocation');
  assert.equal(missing?.id, 'start-location');
});

test('종료 장소가 비면 종료 장소를 가리킨다 — 사용자가 본 화면이 바로 이 경우다', () => {
  const missing = findMissingLocation({ startLocation: '인천국제공항', endLocation: '' });
  assert.equal(missing?.key, 'endLocation');
  assert.equal(missing?.id, 'end-location');
});

test('둘 다 비면 위에 있는 칸부터 말한다', () => {
  const missing = findMissingLocation({ startLocation: '', endLocation: '' });
  assert.equal(missing?.key, 'startLocation');
});

test('공백만 친 것은 채운 것이 아니다', () => {
  assert.equal(findMissingLocation({ startLocation: '   ', endLocation: '서울역' })?.key, 'startLocation');
  assert.equal(findMissingLocation({ startLocation: '인천공항', endLocation: '\t\n ' })?.key, 'endLocation');
});

test('없는 값·이상한 값도 빈 것으로 센다', () => {
  for (const bad of [undefined, null, 0, false, [], {}]) {
    assert.equal(
      findMissingLocation({ startLocation: bad, endLocation: '서울역' })?.key,
      'startLocation',
      `${JSON.stringify(bad)} 를 채운 것으로 셌다`
    );
  }
  assert.equal(findMissingLocation(null)?.key, 'startLocation');
  assert.equal(findMissingLocation(undefined)?.key, 'startLocation');
});

test('구글이 주는 객체 형태도 앱과 똑같은 규칙으로 읽는다', () => {
  // getLocationName 을 그대로 빌려 쓴다 — 여기서 규칙을 다시 적으면
  // 프로브가 앱보다 관대해졌던 그 실수를 검사 쪽에서 반복하는 것이다.
  assert.equal(findMissingLocation({
    startLocation: { displayName: '인천국제공항' },
    endLocation: { formattedAddress: '서울특별시 중구 한강대로 405' }
  }), null);

  assert.equal(
    findMissingLocation({
      startLocation: { displayName: '', formattedAddress: '', address: '' },
      endLocation: '서울역'
    })?.key,
    'startLocation'
  );
});

test('화면에서 읽는 순서 그대로 — 시작이 먼저다', () => {
  assert.deepEqual(REQUIRED_LOCATIONS.map(f => f.key), ['startLocation', 'endLocation']);
  assert.deepEqual(REQUIRED_LOCATIONS.map(f => f.id), ['start-location', 'end-location']);
});
