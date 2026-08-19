/**
 * 생성된 일정을 사용자가 직접 손보는 연산.
 *
 * 지금까지는 마음에 안 들면 전체 재생성뿐이었다("이 식당만 바꾸고 싶다",
 * "이 관광지는 빼고 싶다" 가 불가능). 항목 삭제/순서 변경을 순수 함수로
 * 두면 화면은 결과만 그리면 되고, 규칙(경계 항목은 못 지운다 등)을 테스트로
 * 고정할 수 있다.
 */

/** 출발/도착은 사용자가 폼에서 지정한 경계라 편집 대상이 아니다. */
export function isEditableItem(item) {
  return item?.type !== 'departure' && item?.type !== 'arrival';
}

/**
 * 항목 하나를 뺀다.
 *
 * 삭제만 하고 시각을 그대로 두면 그 자리에 빈 시간이 남는다. 뒤 항목들을
 * 앞으로 당겨 자연스럽게 이어 붙이되, 항목 사이 간격(=이동시간)은 유지한다.
 * 실제 이동시간은 지도가 다시 계산해 덮어쓰므로 여기서는 기존 간격을 쓴다.
 *
 * @param {Array} scheduleItems
 * @param {number} index 지울 항목의 위치
 * @returns {{items: Array, removed: object|null}} removed 가 null 이면 아무것도 안 지운 것
 */
export function removeScheduleItem(scheduleItems, index) {
  const items = Array.isArray(scheduleItems) ? scheduleItems : [];
  const target = items[index];

  if (!target || !isEditableItem(target)) return { items, removed: null };

  const gapAfter = gapBetween(items[index], items[index + 1]);
  const next = items.filter((_, i) => i !== index);

  // 지운 항목이 차지했던 시간 + 그 뒤 간격만큼 뒤 항목들을 당긴다.
  const freed = durationOf(target) + gapAfter;
  const shifted = freed > 0 ? shiftFrom(next, index, -freed) : next;

  return { items: shifted, removed: target };
}

/**
 * 항목을 위/아래로 한 칸 옮긴다.
 *
 * 시각은 자리(슬롯)에 그대로 두고 내용만 맞바꾼다. 그러지 않으면 옮긴 항목이
 * 하루의 흐름에서 벗어난 시각을 갖게 된다. 두 항목의 체류 시간이 다르면
 * 슬롯 길이에 맞춰 종료 시각을 다시 계산한다.
 *
 * @param {Array} scheduleItems
 * @param {number} index
 * @param {-1|1} direction 위(-1) 또는 아래(1)
 * @returns {{items: Array, moved: boolean}}
 */
export function moveScheduleItem(scheduleItems, index, direction) {
  const items = Array.isArray(scheduleItems) ? scheduleItems : [];
  const target = index + direction;

  if (!items[index] || !items[target]) return { items, moved: false };
  if (!isEditableItem(items[index]) || !isEditableItem(items[target])) return { items, moved: false };

  const next = items.map(item => ({ ...item }));
  const a = next[index];
  const b = next[target];

  // 각자의 시각(슬롯)은 두고 내용만 교환한다.
  const slotA = { time: a.time, endTime: a.endTime };
  const slotB = { time: b.time, endTime: b.endTime };

  next[index] = { ...b, ...slotA };
  next[target] = { ...a, ...slotB };

  return { items: next, moved: true };
}

function minutesOf(time) {
  if (!/^\d{2}:\d{2}$/.test(time || '')) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutes(total) {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

function durationOf(item) {
  const start = minutesOf(item?.time);
  const end = minutesOf(item?.endTime);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

function gapBetween(prev, next) {
  const prevEnd = minutesOf(prev?.endTime) ?? minutesOf(prev?.time);
  const nextStart = minutesOf(next?.time);
  if (prevEnd === null || nextStart === null) return 0;
  return Math.max(0, nextStart - prevEnd);
}

/** fromIndex 이후 항목들의 시각을 offset 분만큼 옮긴다. */
function shiftFrom(items, fromIndex, offset) {
  return items.map((item, i) => {
    if (i < fromIndex) return item;
    const start = minutesOf(item.time);
    const end = minutesOf(item.endTime);
    const next = { ...item };
    if (start !== null) next.time = formatMinutes(start + offset);
    if (end !== null) next.endTime = formatMinutes(end + offset);
    return next;
  });
}
