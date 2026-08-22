/**
 * 공용 인라인 SVG 아이콘.
 *
 * 처음에는 결과 화면 전용이었는데 여행 폼도 같은 그림이 필요해졌다.
 * 도메인 하나에 두면 planner → itinerary 처럼 도메인끼리 서로를 알게 되므로
 * 공용 UI 로 옮겼다. 아이콘은 도메인 지식이 아니라 표기 수단이다.
 *
 * 이모지를 쓰지 않는 이유는 두 가지다.
 *  1) 색: 규칙이 "UI 는 무채색, 색은 지도 마커 규칙에만" 인데, 이모지는 OS 가
 *     정한 자기 색을 갖고 들어온다. 📍 하나가 빨갛게 박히면 보라(고정 일정)·
 *     초록(첫 장소)·파랑(나머지)이 뜻을 잃는다.
 *  2) 일관성: 모양이 기기마다 다르고, 그래서 캡처 결과도 기기마다 달라진다.
 *
 * 전부 currentColor 를 쓰므로 감싼 요소의 색을 그대로 따라간다.
 */
const svg = (body, size = 15) =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" ` +
  `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** 달력 몸통. calendar 와 hours 가 같은 그림을 쓴다. */
const CALENDAR_BODY =
  '<rect x="2.4" y="3.2" width="11.2" height="10.4" rx="1.2"/><path d="M2.4 6.4h11.2M5.4 2v2.4M10.6 2v2.4"/>';

export const icons = {
  /** 장소 */
  pin: svg('<path d="M8 14.2s4.6-4 4.6-7.4a4.6 4.6 0 1 0-9.2 0C3.4 10.2 8 14.2 8 14.2z"/><circle cx="8" cy="6.7" r="1.7"/>'),
  /** 체류 시간 */
  clock: svg('<circle cx="8" cy="8" r="5.8"/><path d="M8 4.6V8l2.3 1.5"/>'),
  /** 비용 */
  cost: svg('<path d="M2.8 3.6 5.6 10.6 8 5.4l2.4 5.2 2.8-7M2.2 7.4h11.6M2.2 9.4h11.6"/>'),
  /** 영업 시간 */
  hours: svg(CALENDAR_BODY),
  /** 여행 날짜 */
  calendar: svg(CALENDAR_BODY, 13),
  /** 현지 팁 */
  tip: svg('<path d="M6.2 12.4h3.6M6.6 14h2.8M8 2.2a4 4 0 0 0-2.4 7.2c.4.3.6.8.6 1h3.6c0-.2.2-.7.6-1A4 4 0 0 0 8 2.2z"/>'),
  /** 길찾기 */
  route: svg('<path d="M4.2 13.4V6.2a2.2 2.2 0 0 1 2.2-2.2h3.2"/><path d="M8 2.2 10.4 4 8 5.8"/><circle cx="4.2" cy="13.4" r="1.2"/>'),
  /** 알림 */
  info: svg('<circle cx="8" cy="8" r="5.8"/><path d="M8 7.2v3.6"/><circle cx="8" cy="5.2" r=".7" fill="currentColor" stroke="none"/>'),
  /** 경고 */
  warn: svg('<path d="M8 2.6 14 12.8H2z"/><path d="M8 6.4v3"/><circle cx="8" cy="11" r=".7" fill="currentColor" stroke="none"/>'),
  /** 지도에서 찾은 곳 */
  search: svg('<circle cx="7.2" cy="7.2" r="4.4"/><path d="m10.4 10.4 3 3"/>'),
};
