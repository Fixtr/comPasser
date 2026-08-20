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

  // 이름도 주소도 새로 알려줄 게 없으면 줄 자체를 띄우지 않는다.
  if (matching && !where) return { visible: false, mismatch: false, detail: '' };
  if (!found && !where) return { visible: false, mismatch: false, detail: '' };

  const detail = found && where ? `${found} · ${where}` : (found || where);
  return { visible: true, mismatch: !matching, detail };
}
