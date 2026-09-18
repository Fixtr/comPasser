/**
 * itinerary-view.js 의 "배선(orchestration)" 로직을 순수 함수로 분리한 모듈.
 *
 * 왜 분리했나: 이 앱에서 반복해서 새어나간 버그들은 계산 로직 자체가 아니라
 * "그 계산을 어느 경로에서 부르는가"였다.
 *   - 저장/공유 링크로 연 일정에는 가드레일이 아예 적용되지 않았음
 *   - 날짜 탭을 바꿔도 종료 시각 경고가 이전 날짜 것으로 남아 있었음
 * 계산 함수(enforcePlannerConstraints, applyTransitDelays)는 단위 테스트가
 * 지켜주고 있었지만 배선은 아무도 지켜주지 않았다. itinerary-view.js 는
 * Firebase 초기화 부작용 때문에 Node 에서 import 조차 되지 않아 테스트할 수
 * 없었기 때문이다.
 *
 * 그래서 "원본 데이터 + 보고 있는 날짜 + 실제 이동시간" 을 받아 화면에 필요한
 * 모든 값을 계산하는 부분만 여기로 옮겼다. 이 모듈은 DOM/Firebase 의존이
 * 없어 plain Node 로 그대로 테스트할 수 있고, itinerary-view.js 는 결과를
 * 그리기만 한다.
 */

import { normalizeData } from './itinerary-normalize.mjs';
import { applyTransitDelays, getEndTimeOverflowMinutes } from './itinerary-schedule-adjust.mjs';
import {
  enforcePlannerConstraints,
  normalizePlannerRequest
} from '../../planner/services/planner-constraints.mjs';

/**
 * 저장/공유로 읽어온 일정에도 확정적 가드레일을 다시 적용한다.
 *
 * enforcePlannerConstraints 는 원래 생성 시점(gemini-optimizer.js)에만
 * 호출됐다. 그래서 저장된 일정을 열면 저장 당시 상태 그대로 렌더링됐고,
 * 이후 가드레일이 개선돼도 기존 일정에는 전혀 반영되지 않았다.
 *
 * 저장 데이터는 { request, days } 형태로 사용자가 입력했던 제약 조건을
 * 그대로 갖고 있으므로 열 때마다 같은 보정을 재적용할 수 있다. request 가
 * 없는 아주 예전 데이터는 보정 기준이 없으므로 원본을 그대로 둔다.
 *
 * @param {object} rawData Firestore/생성 결과 원본
 * @param {string} language 'ko' | 'en'
 * @returns {object} 보정된 원본과 같은 형태의 객체(입력은 변경하지 않음)
 */
export function reconcileWithConstraints(rawData, language = 'ko') {
  const safePlan = normalizeData(rawData);
  const request = rawData?.request;
  if (!safePlan || !Array.isArray(safePlan.days) || !request) return rawData;

  const correctedDays = enforcePlannerConstraints(safePlan.days, request, language);

  // 원본이 { itineraryPlan: {...} } 로 감싸진 구버전 형태면 껍데기를 유지한다.
  if (rawData.itineraryPlan && Array.isArray(rawData.itineraryPlan.days)) {
    return { ...rawData, itineraryPlan: { ...rawData.itineraryPlan, days: correctedDays } };
  }
  return { ...rawData, days: correctedDays };
}

/**
 * 특정 날짜에 대해 사용자가 입력했던 제약 조건(시작/종료 시각 등)을 찾는다.
 *
 * request 는 두 가지 형태로 존재할 수 있다. 폼이 그대로 만든 flat 형태
 * ({ startTime, endTime, ... })와 normalizePlannerRequest 를 거친 dailyData
 * 형태다. dailyData 만 읽으면 flat 형태로 저장된 일정에서는 종료 시각을
 * 영영 찾지 못해 초과 경고가 아예 뜨지 않는다. 그래서 여기서 한 번 더
 * 정규화해 두 형태를 모두 받아준다.
 *
 * day 번호로 먼저 찾고, 번호가 없는 예전 데이터는 인덱스로 폴백한다.
 */
export function getDayConstraints(rawItinerary, activeDayIndex) {
  const request = rawItinerary?.request;
  if (!request || typeof request !== 'object') return null;

  const dailyData = Array.isArray(request.dailyData) && request.dailyData.length > 0
    ? request.dailyData
    : normalizePlannerRequest(request).dailyData;
  if (!Array.isArray(dailyData) || dailyData.length === 0) return null;

  const dayNumber = activeDayIndex + 1;
  return dailyData.find(day => Number(day.day) === dayNumber) || dailyData[activeDayIndex] || null;
}

/**
 * 표시된 시각이 "실제 이동시간으로 검증된 것"인지 "AI 추정치일 뿐"인지 판정한다.
 *
 * 지도(map-view)는 지오코딩/Directions 실패 시 조용히 빠져나가기 때문에,
 * 화면에는 AI 추정 시각이 마치 확정된 것처럼 남는다. 사용자가 그 차이를
 * 알 수 있도록 구간별 실제 소요시간이 몇 개나 확보됐는지 계산한다.
 *
 * @param {Array} scheduleItems 하루치 일정(항목 N개 -> 구간 N-1개)
 * @param {Array} transitRoutes map-view 가 넘긴 구간별 경로
 * @param {boolean} [mapFailed] 지도가 실패를 명시적으로 알린 경우
 * @returns {{expected:number, resolved:number, status:'none'|'partial'|'verified'}}
 */
export function getTransitCoverage(scheduleItems, transitRoutes, mapFailed = false) {
  const items = Array.isArray(scheduleItems) ? scheduleItems : [];
  const expected = Math.max(0, items.length - 1);

  const resolved = (Array.isArray(transitRoutes) ? transitRoutes : []).filter(route => (
    route &&
    typeof route.durationMinutes === 'number' &&
    Number.isFinite(route.durationMinutes)
  )).length;

  // 구간이 아예 없는 일정(항목 1개 이하)은 검증할 것도 없다.
  if (expected === 0) return { expected, resolved, status: 'verified' };
  if (mapFailed || resolved === 0) return { expected, resolved, status: 'none' };
  return { expected, resolved, status: resolved >= expected ? 'verified' : 'partial' };
}

/**
 * 이미 화면에 반영된 일정을 기준으로 종료 시각 초과 여부만 다시 계산한다.
 *
 * 주의: 여기서 절대 reconcile(enforcePlannerConstraints)을 다시 돌리면 안 된다.
 * 그 함수는 종료 시각을 넘긴 항목을 제거하고 도착을 종료 시각으로 되돌리므로,
 * 실제 이동시간 때문에 발생한 초과가 그대로 지워져 경고가 사라진다.
 * (날짜 탭 전환 시 경고를 갱신할 때 실제로 이 문제가 발생했다.)
 *
 * @param {object} itinerary 이동시간 보정이 이미 반영된 일정
 * @param {number} activeDayIndex 보고 있는 날짜 인덱스(0-base)
 * @returns {{endTime: string|null, overflowMinutes: number}}
 */
export function getEndTimeWarning(itinerary, activeDayIndex = 0, transitRoutes = []) {
  const plan = normalizeData(itinerary);
  const items = plan?.days?.[activeDayIndex]?.scheduleItems;
  const endTime = getDayConstraints(itinerary, activeDayIndex)?.endTime || null;
  if (!Array.isArray(items) || !endTime) return { endTime, overflowMinutes: 0 };
  // Reading a saved snapshot does not move its times. Project current route
  // evidence separately so freezing the snapshot cannot hide a new delay.
  const projected = applyTransitDelays(items, transitRoutes);
  return { endTime, overflowMinutes: Math.max(getEndTimeOverflowMinutes(items, endTime), getEndTimeOverflowMinutes(projected, endTime)) };
}

/**
 * 화면이 필요로 하는 모든 값을 한 번에 계산한다.
 *
 * 순서가 중요하다:
 *   1) 가드레일 재적용(reconcile) — 저장된 일정도 최신 규칙을 통과시킨다
 *   2) 실제 이동시간 반영(applyTransitDelays) — 보고 있는 날짜에만
 *   3) 종료 시각 초과 계산 — 보정이 끝난 결과 기준, 보고 있는 날짜 기준
 *
 * @param {object}  params
 * @param {object}  params.rawItinerary   원본(또는 이미 보정된) 일정 데이터
 * @param {number} [params.activeDayIndex] 보고 있는 날짜 인덱스(0-base)
 * @param {Array}  [params.transitRoutes]  map-view 가 계산한 실제 이동시간
 * @param {string} [params.language]       'ko' | 'en'
 * @returns {{itinerary: object, days: Array, scheduleItems: Array, endTime: string|null, overflowMinutes: number}}
 */
export function buildItineraryViewModel({
  rawItinerary,
  activeDayIndex = 0,
  transitRoutes = [],
  language = 'ko'
} = {}) {
  const empty = { itinerary: rawItinerary, days: [], scheduleItems: [], endTime: null, overflowMinutes: 0 };
  if (!rawItinerary) return empty;

  const itinerary = reconcileWithConstraints(rawItinerary, language);
  const plan = normalizeData(itinerary);
  const days = Array.isArray(plan?.days) ? plan.days : [];
  if (days.length === 0) return { ...empty, itinerary };

  const dayIndex = (activeDayIndex >= 0 && activeDayIndex < days.length) ? activeDayIndex : 0;
  const dayData = days[dayIndex];
  const constraints = getDayConstraints(itinerary, dayIndex);
  const endTime = constraints?.endTime || null;

  const baseItems = Array.isArray(dayData?.scheduleItems) ? dayData.scheduleItems : [];
  const scheduleItems = applyTransitDelays(baseItems, transitRoutes);

  return {
    itinerary,
    days,
    scheduleItems,
    endTime,
    overflowMinutes: getEndTimeOverflowMinutes(scheduleItems, endTime)
  };
}
