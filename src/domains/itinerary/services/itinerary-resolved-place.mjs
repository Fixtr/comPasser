/**
 * 지도가 실제로 찾아낸 장소를 타임라인에 어떻게 보여줄지 정하는 순수 로직.
 *
 * AI가 적어준 이름("서울 경복궁")과 Places API가 돌려준 이름("경복궁")은
 * 대개 다르다. 대부분은 같은 곳을 가리키는 표기 차이지만, 가끔은 전혀 엉뚱한
 * 곳이 잡힌다. 그 둘을 구분해서 후자만 눈에 띄게 하는 것이 목적이다.
 */

/** 표기 차이(공백·괄호·구두점·대소문자)를 지운다. */
export function normalizePlaceName(value) {
  return String(value || '').toLowerCase().replace(/[\s()\[\]{},.\-_/\\]/g, '');
}

/** 한글 자모·음절이 들어 있는가. */
function hasHangul(value) {
  return /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(String(value || ''));
}

/** 로마자가 들어 있는가. */
function hasLatin(value) {
  return /[A-Za-z]/.test(String(value || ''));
}

/**
 * 두 이름을 같은 잣대로 비교할 수 있는가.
 *
 * 한쪽은 한글 표기("경복궁"), 다른 쪽은 로마자 표기("Gyeongbokgung Palace")면
 * 같은 곳이라도 글자가 하나도 겹치지 않는다. 이때의 불일치는 "다른 곳"이
 * 아니라 "번역된 같은 곳"일 가능성이 훨씬 크므로 경고 근거로 쓸 수 없다.
 *
 * 이 규칙이 진짜 오매칭까지 덮지는 않는다 — 같은 체계 안에서는(한글끼리,
 * 로마자끼리) 기존 비교가 그대로 돌아간다.
 */
export function isComparableName(written, found) {
  const a = String(written || '');
  const b = String(found || '');
  const aHangul = hasHangul(a);
  const bHangul = hasHangul(b);
  if (aHangul === bHangul) return true;
  // 한글이 없는 쪽이 로마자 표기라면 서로 다른 문자 체계다.
  return !hasLatin(aHangul ? b : a);
}

/**
 * 적어둔 이름과 찾아낸 이름이 같은 곳으로 볼 만한가.
 * 한쪽이 다른 쪽을 품고 있으면 같은 곳으로 본다("경복궁" ⊂ "서울 경복궁").
 * 찾아낸 이름이 없으면 경고할 근거가 없으므로 일치로 둔다.
 */
export function isResolvedNameMatching(written, found) {
  const a = normalizePlaceName(written);
  const b = normalizePlaceName(found);
  if (!b) return true;
  if (!a) return true;
  // 표기 체계가 아예 다르면 비교 자체가 성립하지 않는다. 경고하지 않는다.
  if (!isComparableName(written, found)) return true;
  return a.includes(b) || b.includes(a);
}

/**
 * 한 항목의 "지도에서 찾은 곳" 줄을 어떻게 그릴지 반환한다.
 * @returns {{visible: boolean, mismatch: boolean, detail: string}}
 */
export function describeResolvedPlace({ written, name, address } = {}) {
  const found = String(name || '').trim();
  const where = String(address || '').trim();
  const matching = isResolvedNameMatching(written, found);
  const comparable = isComparableName(written, found);

  // 이름도 주소도 새로 알려줄 게 없으면 줄 자체를 띄우지 않는다.
  if (!found && !where) return { visible: false, mismatch: false, detail: '' };
  // 표기 체계가 다르면 찾은 이름 자체가 새 정보다. 영어로 일정을 본 사람에게
  // 한글 상호는 택시 기사에게 보여줄 수 있는 실질적인 값이므로 숨기지 않는다.
  if (matching && !where && comparable) return { visible: false, mismatch: false, detail: '' };

  const detail = found && where ? `${found} · ${where}` : (found || where);
  return { visible: true, mismatch: !matching, detail };
}
