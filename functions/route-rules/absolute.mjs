// 동선설계 절대기준: 나라·도시와 상관없이 항상 지키는 규칙.
// 서버(프롬프트)와 앱(생성 직후 보정, 결과 화면)이 모두 이 값을 읽는다.
// 공항 여유 시간은 거리 계산이 필요해 ../airport-buffer.mjs 에 따로 있다.

// 최소 체류 시간(분). 이보다 짧게 줄여야 하면 그 방문은 뺀다.
export const MIN_STAY = {
  meal: 60, // 식당 식사
  visit: 20, // 카페·기타 방문
};

// AI에게 남기라고 하는 방문 사이 여유(분). 실제 이동시간은 나중에 지도로 잰다.
export const TRAVEL_GAP = {
  terminal: 30, // 기차·버스 터미널 앞
  other: 15,
};

// 하루 카페·간식 방문 최대 개수 (AI 지시문과 빈 시간 채우기가 같이 씀)
export const MAX_CAFES_PER_DAY = 2;

// 공항 종료일, 버퍼에 걸린 저녁을 앞당길 수 있는 최대 시간(분)
export const AIRPORT_MEAL_MAX_SHIFT = 90;

// 빈 시간 채우기
export const GAP_FILL = {
  visit: 60, // 넣는 방문 1곳의 체류(분)
  slack: 30, // 넣은 방문 뒤 다음 일정까지 남기는 여유(분)
  maxVisitsPerDay: 2,
  maxSearchesPerDay: 4,
};
