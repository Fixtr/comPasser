/**
 * 여행 날짜 검증.
 *
 * 과거 날짜로 일정을 만들면 결과가 조용히 망가진다. transit-time.mjs 가
 * 지나간 출발 시각을 "다음 주 같은 요일"로 밀어 조회하기 때문에, 화면에는
 * 어제 날짜가 적혀 있는데 이동 경로만 다음 주 시간표로 계산된다.
 *
 * 날짜 입력의 min 속성만으로는 부족하다. 사용자가 어제 "오늘"을 골라둔 채
 * 탭을 열어두면 sessionStorage 의 날짜가 그대로 남아 자정을 넘겨 제출될 수
 * 있고, min 은 개발자 도구로 지울 수도 있다. 그래서 제출 시점에 한 번 더
 * 확인한다.
 */

/** Date -> "YYYY-MM-DD" (로컬 기준). UTC 로 바꾸면 하루가 밀린다. */
export function toLocalDateString(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 오늘 날짜를 "YYYY-MM-DD" 로. */
export function todayString(now = new Date()) {
  return toLocalDateString(now);
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

/**
 * 주어진 날짜들 중 오늘보다 이전인 첫 번째 날짜를 돌려준다.
 *
 * 문자열 비교로 충분하다("2026-08-19" < "2026-08-20"). 형식이 아닌 값은
 * 검증 대상이 아니므로 건너뛴다(다른 검증이 잡는다).
 *
 * @param {string|string[]} dates 날짜 하나 또는 배열
 * @param {Date} [now] 테스트 주입용
 * @returns {string|null} 과거 날짜 문자열, 없으면 null
 */
export function findPastDate(dates, now = new Date()) {
  const list = Array.isArray(dates) ? dates : [dates];
  const today = todayString(now);

  for (const value of list) {
    const date = String(value || '').trim();
    if (!isValidDateString(date)) continue;
    if (date < today) return date;
  }
  return null;
}
