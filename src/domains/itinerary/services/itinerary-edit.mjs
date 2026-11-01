/**
 * 생성된 일정을 사용자가 직접 손보는 연산.
 *
 * 지금까지는 마음에 안 들면 전체 재생성뿐이었다("이 식당만 바꾸고 싶다",
 * "이 관광지는 빼고 싶다" 가 불가능). 항목 삭제/순서 변경을 순수 함수로
 * 두면 화면은 결과만 그리면 되고, 규칙(경계 항목은 못 지운다 등)을 테스트로
 * 고정할 수 있다.
 */

import { normalizeSelectedPlace } from '../../planner/services/selected-place.mjs';

export function editVisitTime(items, index, start, end) {
  const item=items?.[index];
  const valid=t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t || '');
  const fixed=i=>['departure','arrival','AnchorSchedule'].includes(i.type);
  if(!Array.isArray(items) || !Number.isInteger(index) || !item || fixed(item)) return {items,changed:false};
  const previous=items.slice(0,index).filter(fixed).at(-1), next=items.slice(index+1).find(fixed);
  const lower=previous?.endTime || previous?.time, upper=next?.time;
  if (!valid(start) || !valid(end) || end<=start || (lower && (!valid(lower) || start<lower)) || (upper && (!valid(upper) || end>upper))) {
    // A closed gap or a malformed boundary rejects every entry, so report no limits instead of a range that cannot work.
    const open=(!lower || valid(lower)) && (!upper || valid(upper)) && !(lower && upper && lower>=upper);
    return {items,changed:false,lower:open && lower || '',upper:open && upper || ''};
  }
  return {items:items.map((i,n)=>n===index ? {...i,time:start,endTime:end,visitNotBefore:start,duration:'',transitInfo:''} : i),changed:true};
}

// Replace a venue, not its time slot. Do not carry AI claims about the old
// venue (costs, hours, links, reviews or recommendation intent) to the new one.
export function replaceSchedulePlace(scheduleItems, index, value) {
  const selectedPlace = normalizeSelectedPlace(value);
  const previous = scheduleItems?.[index];
  if (!Array.isArray(scheduleItems) || !Number.isInteger(index) || !previous || !selectedPlace ||
      ['departure', 'arrival', 'AnchorSchedule'].includes(previous.type)) {
    return { items: scheduleItems, replaced: null };
  }
  const replaced = {
    type: previous.type, time: previous.time || '', endTime: previous.endTime || '',
    duration: previous.duration || '', title: selectedPlace.displayName,
    location: selectedPlace.formattedAddress, selectedPlace,
    latLng: { lat: selectedPlace.lat, lng: selectedPlace.lng },
    resolvedName: selectedPlace.displayName, resolvedAddress: selectedPlace.formattedAddress,
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPlace.displayName)}&query_place_id=${encodeURIComponent(selectedPlace.placeId)}`,
    addedByUser: true,
  };
  return { items: scheduleItems.map((item, i) => i === index ? replaced : item), replaced };
}

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

/** 새로 넣는 장소의 기본 체류 시간(분). 앞뒤 여유가 부족하면 줄어든다. */
export const DEFAULT_STAY_MINUTES = 60;

/**
 * 지정한 위치에 장소를 새로 끼워 넣는다.
 *
 * 폼의 "필수 방문 일정(Anchor)" 과 개념은 같지만 시점이 다르다. 앵커는 생성
 * 전에 AI 에게 넘기는 제약이고, 이건 이미 만들어진 일정을 사용자가 손보는
 * 것이다. AI 를 다시 부르지 않으므로 동선이 재최적화되지는 않는다 —
 * 사용자가 고른 자리에 그대로 들어간다.
 *
 * 시각은 앞 항목이 끝난 뒤부터 잡는다. 실제 이동시간은 지도가 다시 계산해
 * 덮어쓰므로 여기서는 최소한의 자리만 만들어 준다. 뒤 항목들은 새 장소가
 * 차지한 만큼 뒤로 민다.
 *
 * @param {Array} scheduleItems
 * @param {number} insertAt 새 항목이 들어갈 위치(0 이면 맨 앞)
 * Like replacement, the place must come from the place search: typed text alone
 * would leave the map to guess the venue and its travel times.
 *
 * @param {{selectedPlace: object, stayMinutes?: number}} place
 * @returns {{items: Array, inserted: object|null}}
 */
export function insertScheduleItem(scheduleItems, insertAt, place) {
  const items = Array.isArray(scheduleItems) ? scheduleItems.map(item => ({ ...item })) : [];
  const selectedPlace = normalizeSelectedPlace(place?.selectedPlace);
  if (!selectedPlace) return { items: scheduleItems, inserted: null };

  // 출발 앞이나 도착 뒤에는 넣을 수 없다. 그 둘은 사용자가 폼에서 정한 경계다.
  const index = clampInsertIndex(items, insertAt);
  if (index === null) return { items: scheduleItems, inserted: null };

  const stay = Math.max(10, Number(place?.stayMinutes) || DEFAULT_STAY_MINUTES);
  const prev = items[index - 1];
  const prevEnd = prev ? (minutesOf(prev.endTime) ?? minutesOf(prev.time)) : null;
  const start = prevEnd !== null ? prevEnd : minutesOf(items[index]?.time) ?? 0;

  const inserted = {
    time: formatMinutes(start),
    endTime: formatMinutes(start + stay),
    type: 'attraction',
    title: selectedPlace.displayName,
    description: '',
    location: selectedPlace.formattedAddress,
    selectedPlace,
    latLng: { lat: selectedPlace.lat, lng: selectedPlace.lng },
    resolvedName: selectedPlace.displayName,
    resolvedAddress: selectedPlace.formattedAddress,
    duration: `${Math.floor(stay / 60) ? `${Math.floor(stay / 60)}시간 ` : ''}${stay % 60 ? `${stay % 60}분` : ''}`.trim() || `${stay}분`,
    officialWebsiteUrl: '',
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPlace.displayName)}&query_place_id=${encodeURIComponent(selectedPlace.placeId)}`,
    transitInfo: '',
    // 사용자가 직접 넣은 항목임을 남긴다. 화면에서 구분해 표시할 수 있다.
    addedByUser: true
  };

  items.splice(index, 0, inserted);

  // 새 항목이 차지한 시간만큼 뒤를 민다. 실제 이동시간은 지도가 다시 계산한다.
  const shifted = shiftFrom(items, index + 1, stay);
  return { items: shifted, inserted };
}

/**
 * 삽입 가능한 위치로 보정한다.
 * 출발(맨 앞)과 도착(맨 뒤) 사이에만 넣을 수 있다.
 */
function clampInsertIndex(items, requested) {
  const firstEditable = items.findIndex(isEditableItem);
  const lastEditable = findLastIndex(items, isEditableItem);

  // 편집 가능한 항목이 하나도 없으면 경계 사이(있다면)에 넣는다.
  const min = firstEditable === -1
    ? (items.length > 0 && !isEditableItem(items[0]) ? 1 : 0)
    : firstEditable;
  const max = lastEditable === -1
    ? min
    : lastEditable + 1;

  const index = Number.isInteger(requested) ? requested : max;
  if (index < min) return min;
  if (index > max) return max;
  return index;
}

function findLastIndex(list, predicate) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (predicate(list[i])) return i;
  }
  return -1;
}
