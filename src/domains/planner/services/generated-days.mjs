/**
 * Cloud Function 응답의 `days` 배열이 렌더링 가능한 최소 형태인지 검증한다.
 * 비어있거나 배열이 아니면 호출부는 생성 실패로 처리해야 한다.
 *
 * firebase 의존성이 없는 순수 함수로 분리되어 있어 `gemini-optimizer.js`
 * (Firebase 앱 초기화 부작용 때문에 plain Node 환경에서 직접 import 할 수 없음)
 * 없이도 단독으로 테스트할 수 있다.
 */
export function isValidGeneratedDays(days) {
  return Array.isArray(days) && days.length > 0;
}
