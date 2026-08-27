/**
 * 출발·도착 장소가 채워졌는가.
 *
 * 왜 따로 모듈인가 — 이 칸들은 `<gmp-place-autocomplete>`, 즉 폼에 참여하지
 * 않는 커스텀 엘리먼트다. `required` 를 붙여도 브라우저 기본 검사는 이 칸을
 * 아예 못 본다(진짜 <input> 인 날짜·시각만 막혔던 이유가 이것이다).
 * 그래서 막는 일을 JS 가 대신 해야 하고, 그 규칙은 한 곳에만 있어야 한다.
 *
 * 값 읽는 규칙을 여기서 새로 적지 않고 planner-constraints 의
 * `getLocationName` 을 그대로 빌려 쓴다. 뒤에서 실제로 쓰는 규칙과 여기가
 * 어긋나면, 검사는 통과시키고 계획은 빈손으로 도는 상태가 만들어진다.
 */
import { getLocationName } from './planner-constraints.mjs';

/** 화면에서 위에서 아래로 읽는 순서 그대로. */
export const REQUIRED_LOCATIONS = [
  { key: 'startLocation', id: 'start-location', labelKey: 'startLocation' },
  { key: 'endLocation', id: 'end-location', labelKey: 'endLocation' }
];

/**
 * 비어 있는 첫 장소 칸. 다 채워졌으면 null.
 * @returns {{key: string, id: string, labelKey: string} | null}
 */
export function findMissingLocation(plannerRequest) {
  for (const field of REQUIRED_LOCATIONS) {
    if (getLocationName(plannerRequest?.[field.key]) === '') return field;
  }
  return null;
}
