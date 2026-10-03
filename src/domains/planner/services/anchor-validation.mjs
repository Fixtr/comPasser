/**
 * 고정 일정 한 줄의 상태를 가른다 — 비었나, 덜 찼나, 다 찼나.
 *
 * 이 파일이 생긴 이유: 같은 질문에 세 층이 다르게 답하고 있었다.
 * 데이터 층(`travel-form-data.js`)은 빈 줄을 버리고, 제출 핸들러는 덜 찬 줄을
 * 건너뛰는데, 마크업만 `required` 로 제출 자체를 막았다. 사용자에게는
 * "버튼을 눌러도 아무 일이 없다"로 보였다. 판단하는 곳을 하나로 모은다.
 *
 * 순수 함수만 둔다 — DOM 도 i18n 도 모른다. 화면에서 어느 칸으로 데려갈지는
 * 부르는 쪽이 정한다.
 */

/** 이 셋이 있어야 계획을 세울 수 있다. 장소는 있으면 좋고 없어도 된다. */
export const REQUIRED_ANCHOR_FIELDS = ['name', 'time', 'endTime'];

/** 사람이 손대야 채워지는 칸들. `day` 는 여기 없다(아래 참고). */
const TOUCHED_FIELDS = [...REQUIRED_ANCHOR_FIELDS, 'location'];

const isBlank = (value) => typeof value === 'string' ? value.trim() === '' : value == null;

/**
 * 한 글자도 안 넣은 줄인가.
 *
 * `day` 를 세지 않는 이유: `<select class="anchor-day">` 는 첫 옵션이 자동으로
 * 선택돼 늘 값이 있다. 그것까지 "채웠다"로 치면 모든 줄이 채워진 줄이 되어
 * 빈 줄이라는 개념 자체가 없어진다.
 */
export function isAnchorBlank(anchor) {
  if (!anchor) return true;
  if (anchor.flexible === true) return false;
  return TOUCHED_FIELDS.every((field) => isBlank(anchor[field]));
}

/**
 * 이 줄에서 아직 안 채운 필수 칸들. 빈 줄이면 요구하지 않는다 —
 * 눌러만 보고 안 쓴 줄까지 붙잡으면 그게 처음의 그 고장이다.
 */
export function missingAnchorFields(anchor) {
  if (isAnchorBlank(anchor)) return [];
  if (anchor.flexible === true) return ['name', 'location'].filter(field => isBlank(anchor[field]));
  return REQUIRED_ANCHOR_FIELDS.filter((field) => isBlank(anchor[field]));
}

/**
 * 손댔지만 덜 찬 첫 줄을 찾는다.
 * `index` 는 화면에 보이는 줄 순서 그대로다(빈 줄도 세어 둔다) — 사용자에게
 * "두 번째 고정 일정"이라고 말하려면 화면과 번호가 같아야 한다.
 *
 * @returns {{index: number, field: string, missing: string[]}|null}
 */
export function findIncompleteAnchor(anchors) {
  const list = Array.isArray(anchors) ? anchors : [];
  for (let index = 0; index < list.length; index += 1) {
    const missing = missingAnchorFields(list[index]);
    if (missing.length > 0) return { index, field: missing[0], missing };
  }
  return null;
}
