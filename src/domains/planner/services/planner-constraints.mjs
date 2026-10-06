import { normalizeSelectedPlace } from './selected-place.mjs';

function selectedFields(location) {
  const selectedPlace = normalizeSelectedPlace(location);
  // Explicitly clear stale AI/previous-selection coordinates on reconciliation.
  return selectedPlace ? {
    selectedPlace, latLng: {lat:selectedPlace.lat,lng:selectedPlace.lng},
    resolvedName:selectedPlace.displayName, resolvedAddress:selectedPlace.formattedAddress
  } : { selectedPlace: null, latLng: null, resolvedName: '', resolvedAddress: '' };
}

function asNonEmptyString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Returns the user-facing name for either a plain autocomplete string or a
 * structured Google Place value.
 */
export function getLocationName(location) {
  if (typeof location === 'string') return location.trim();
  if (!location || typeof location !== 'object') return '';

  return asNonEmptyString(location.displayName)
    || asNonEmptyString(location.formattedAddress)
    || asNonEmptyString(location.address);
}

export function formatLocationForPrompt(location) {
  if (typeof location === 'string') return location.trim();
  if (!location || typeof location !== 'object') return '';

  const name = asNonEmptyString(location.displayName);
  const address = asNonEmptyString(location.formattedAddress)
    || asNonEmptyString(location.address);

  if (name && address && name !== address) return `${name} (${address})`;
  return name || address;
}

/**
 * The form emits flat fields, while older optimizer code expects dailyData.
 * Keep both shapes so saved itineraries/edit mode remain backwards-compatible.
 */
export function normalizePlannerRequest(plannerRequest = {}) {
  const dates = Array.isArray(plannerRequest.date)
    ? plannerRequest.date
    : [plannerRequest.date].filter(Boolean);
  const existingDailyData = Array.isArray(plannerRequest.dailyData)
    ? plannerRequest.dailyData
    : [];
  const dailyTimes = Array.isArray(plannerRequest.dailyTimes)
    ? plannerRequest.dailyTimes
    : [];
  const anchors = Array.isArray(plannerRequest.anchorSchedules)
    ? plannerRequest.anchorSchedules
    : [];
  const overnightLocations = Array.isArray(plannerRequest.overnightLocations)
    ? plannerRequest.overnightLocations : null;
  const dayCount = Math.max(dates.length, existingDailyData.length, 1);

  const dailyData = Array.from({ length: dayCount }, (_, index) => {
    const dayNumber = index + 1;
    const existingDay = existingDailyData.find(day => Number(day.day) === dayNumber)
      || existingDailyData[index]
      || {};
    const dayTimes = dailyTimes.find(day => Number(day.day) === dayNumber)
      || dailyTimes[index]
      || {};
    const flatAnchors = anchors.filter(anchor => Number(anchor.day || 1) === dayNumber);
    const existingAnchors = Array.isArray(existingDay.anchors) ? existingDay.anchors : [];

    return {
      ...existingDay,
      day: dayNumber,
      date: existingDay.date || dates[index] || dates[0] || '',
      // A cleared custom time is invalid input, not permission to restore a
      // different global time. Validation must see the value the user sees.
      startTime: dayTimes.startTime ?? existingDay.startTime ?? plannerRequest.startTime ?? '',
      endTime: dayTimes.endTime ?? existingDay.endTime ?? plannerRequest.endTime ?? '',
      startLocation: overnightLocations
        ? (index > 0 ? overnightLocations[index - 1] || '' : plannerRequest.startLocation ?? existingDay.startLocation ?? '')
        : existingDay.startLocation || plannerRequest.startLocation || '',
      endLocation: overnightLocations
        ? (index < dayCount - 1 ? overnightLocations[index] || '' : plannerRequest.endLocation ?? existingDay.endLocation ?? '')
        : existingDay.endLocation || plannerRequest.endLocation || '',
      anchors: existingAnchors.length > 0 ? existingAnchors : flatAnchors
    };
  });

  return { ...plannerRequest, dailyData };
}

function normalizeForComparison(value) {
  return getLocationName(value)
    .toLocaleLowerCase()
    .replace(/[\s()[\]{},.\-_/\\]/g, '');
}

function isSameLocation(actual, expected) {
  const actualPlace = normalizeSelectedPlace(actual);
  const expectedPlace = normalizeSelectedPlace(expected);
  if (actualPlace && expectedPlace) return actualPlace.placeId === expectedPlace.placeId;
  const actualText = normalizeForComparison(actual);
  const expectedText = normalizeForComparison(expected);
  if (!actualText || !expectedText) return false;
  return actualText === expectedText
    || actualText.includes(expectedText)
    || expectedText.includes(actualText);
}

function mapsSearchUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function makeBoundaryItem(kind, source, time, isKo) {
  const location = getLocationName(source);
  const isStart = kind === 'departure';
  return {
    time,
    endTime: '',
    type: kind,
    title: isStart
      ? (isKo ? `출발 · ${location}` : `Depart · ${location}`)
      : (isKo ? `도착 · ${location}` : `Arrive · ${location}`),
    description: isStart
      ? (isKo ? '지정한 출발지에서 일정을 시작합니다.' : 'Start the itinerary at the selected departure point.')
      : (isKo ? '지정한 도착지에서 일정을 마칩니다.' : 'Finish the itinerary at the selected destination.'),
    location,
    ...selectedFields(source),
    duration: isStart ? (isKo ? '출발' : 'Departure') : (isKo ? '도착' : 'Arrival'),
    officialWebsiteUrl: '',
    googleMapsUrl: mapsSearchUrl(location),
    transitInfo: ''
  };
}

function makeAnchorItem(anchor, isKo) {
  const location = getLocationName(anchor.location);
  return {
    time: anchor.time || '',
    endTime: anchor.endTime || '',
    type: 'AnchorSchedule',
    title: anchor.name || (isKo ? '필수 일정' : 'Anchor schedule'),
    description: anchor.flexible
      ? (isKo ? '선택한 필수 방문지입니다. 시간은 임시 배치되었습니다.' : 'A required visit with a provisional time.')
      : (isKo ? '사용자가 지정한 필수 일정입니다.' : 'A required schedule selected by the user.'),
    location,
    ...selectedFields(anchor.location),
    duration: anchor.flexible ? (isKo ? '필수 방문지' : 'Required visit') : (isKo ? '고정 일정' : 'Fixed schedule'),
    officialWebsiteUrl: '',
    googleMapsUrl: mapsSearchUrl(location),
    transitInfo: ''
  };
}

function minutes(time) {
  if (!/^\d{2}:\d{2}$/.test(time || '')) return Number.MAX_SAFE_INTEGER;
  const [hours, mins] = time.split(':').map(Number);
  return (hours * 60) + mins;
}

/**
 * 자정을 넘기는 일정(예: 밤 11시 저녁 다음 새벽 1시 공항 이동)의 마지막
 * 항목을 Gemini는 그냥 "01:33"처럼 그날 이른 시각과 구분 안 되는 값으로
 * 준다. 그대로 시각 숫자만 비교하면 "01:33"이 "21:56"보다 이르다고
 * 착각해 정렬도, 종료 시각 초과 판정도 다 틀어진다.
 *
 * AI가 만든(정렬 전) 원래 순서를 기준으로, 직전 항목보다 1시간 넘게
 * 이른 것처럼 보이는 시각은 자정을 넘긴 것으로 간주해 24시간(1440분)을
 * 더한 값으로 취급한다. 실제 time 문자열은 바꾸지 않고, 정렬/비교에만
 * 쓰는 값이다.
 */
function toChronologicalMinutes(items) {
  let dayOffset = 0;
  let prevRaw = null;
  return items.map(item => {
    const raw = minutes(item.time);
    if (raw === Number.MAX_SAFE_INTEGER) return raw;
    if (prevRaw !== null && raw < prevRaw - 60) {
      dayOffset += 1;
    }
    prevRaw = raw;
    return raw + (dayOffset * 1440);
  });
}

function titlesLooselyMatch(a, b) {
  const left = normalizeForComparison(a);
  const right = normalizeForComparison(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function isSameTime(a, b) {
  const left = minutes(a);
  const right = minutes(b);
  return left !== Number.MAX_SAFE_INTEGER && left === right;
}

/**
 * Gemini rarely echoes the anchor name verbatim (only time/location are
 * pinned in the prompt), so an exact title check keeps injecting duplicates.
 * Treat an item as the anchor's event on corroborating signals instead.
 */
function matchesAnchor(item, anchor) {
  // A recommendation near an anchor is not the anchor itself.
  if (item.type !== 'AnchorSchedule' && item.placeIntent?.purpose) return false;
  const sameTitle = titlesLooselyMatch(item.title, anchor.name);
  const sameTime = isSameTime(item.time, anchor.time);
  const samePlace = isSameLocation(item.selectedPlace || item.location, anchor.location);

  if (item.type === 'AnchorSchedule') return sameTitle || sameTime || samePlace;
  return (sameTime && samePlace) || (sameTime && sameTitle) || (sameTitle && samePlace);
}

function anchorAffinity(item, anchor) {
  let score = 0;
  if (item.type === 'AnchorSchedule') score += 4;
  if (isSameTime(item.time, anchor.time)) score += 2;
  if (titlesLooselyMatch(item.title, anchor.name)) score += 1;
  return score;
}

/**
 * LLM instructions are probabilistic. This deterministic boundary makes the
 * selected departure, destination and anchors authoritative in the result.
 */
export function enforcePlannerConstraints(days, plannerRequest, language = 'ko') {
  if (!Array.isArray(days)) return [];
  const normalizedRequest = normalizePlannerRequest(plannerRequest);
  const isKo = language === 'ko';

  return days.map((day, index) => {
    const dayNumber = Number(day.day) || index + 1;
    const constraints = normalizedRequest.dailyData.find(item => Number(item.day) === dayNumber)
      || normalizedRequest.dailyData[index];
    if (!constraints) return day;

    let scheduleItems = Array.isArray(day.scheduleItems) ? [...day.scheduleItems] : [];
    // Detect model overflow before inserting/moving fixed appointments. An
    // app-inserted 13:00 anchor after a 17:00 visit is not the following day.
    const endTimeMinutes = minutes(constraints.endTime);
    const originalChronology = toChronologicalMinutes(scheduleItems);
    scheduleItems = scheduleItems.filter((item, index) => item.type === 'AnchorSchedule'
      || endTimeMinutes === Number.MAX_SAFE_INTEGER || originalChronology[index] < endTimeMinutes);
    const anchors = constraints.anchors || [];

    for (const anchor of anchors) {
      const requiredAnchor = makeAnchorItem(anchor, isKo);
      const matchedIndexes = [];
      scheduleItems.forEach((item, itemIndex) => {
        if (matchesAnchor(item, anchor)) matchedIndexes.push(itemIndex);
      });

      if (matchedIndexes.length === 0) {
        scheduleItems.push(requiredAnchor);
        continue;
      }

      const primaryIndex = matchedIndexes.reduce((best, candidate) => (
        anchorAffinity(scheduleItems[candidate], anchor) > anchorAffinity(scheduleItems[best], anchor)
          ? candidate
          : best
      ), matchedIndexes[0]);

      // Anchor fields are authoritative; keep the AI's richer copy elsewhere.
      const primary = scheduleItems[primaryIndex];
      scheduleItems[primaryIndex] = {
        ...primary,
        ...requiredAnchor,
        endTime: asNonEmptyString(requiredAnchor.endTime) || asNonEmptyString(primary.endTime),
        description: asNonEmptyString(primary.description) || requiredAnchor.description,
        duration: asNonEmptyString(primary.duration) || requiredAnchor.duration,
        transitInfo: asNonEmptyString(primary.transitInfo) || requiredAnchor.transitInfo,
        officialWebsiteUrl: asNonEmptyString(primary.officialWebsiteUrl) || requiredAnchor.officialWebsiteUrl
      };

      matchedIndexes
        .filter(itemIndex => itemIndex !== primaryIndex)
        .sort((a, b) => b - a)
        .forEach(itemIndex => scheduleItems.splice(itemIndex, 1));
    }

    // Only user-selected anchors may carry the AnchorSchedule type; demote
    // hallucinated ones so summaries count exactly what the user picked.
    scheduleItems = scheduleItems.map(item => {
      if (item.type !== 'AnchorSchedule') return item;
      const belongsToUser = anchors.some(anchor => matchesAnchor(item, anchor));
      return belongsToUser ? item : { ...item, type: 'attraction' };
    });

    scheduleItems = scheduleItems
      .filter(item => item.type === 'AnchorSchedule' || minutes(item.time) < endTimeMinutes)
      .sort((a, b) => minutes(a.time) - minutes(b.time));

    // A model can ignore the prompt and schedule a night-only activity in the
    // afternoon. Without a user-fixed appointment or event availability data,
    // that is not a visit we can honestly present as possible.
    scheduleItems = scheduleItems.filter(item => {
      if (item.type === 'AnchorSchedule') return true;
      const name = `${item.title || ''} ${item.placeIntent?.purpose || ''}`;
      return !/(?:특별\s*(?:관람|개방|행사)|special\s*(?:event|opening|tour|viewing))/i.test(name)
        && !(/야간|야경|밤\s*(?:관람|투어)|night|illumination/i.test(name) && minutes(item.time) < 18 * 60);
    });

    // Gemini 는 종종 이동 자체를 하나의 일정처럼 만들어낸다("서울역으로 이동",
    // "인천국제공항 이동", "공항으로 이동 준비"). 실제로는 하나의 다구간 여정일
    // 뿐이고 앱이 두 일정 사이의 실제 경로를 이미 카드로 그려준다.
    //
    // 처음에는 배열 끝에서부터만 제거했는데, AI 가 "인천국제공항 이동" 다음에
    // "인천 도착" 같은 항목을 하나 더 붙이면 가짜 항목이 마지막이 아니게 되어
    // 그대로 남았다(실제 제보 화면). 목적지에 아직 도달하지 않은 이동 서술
    // 항목은 위치에 상관없이 전부 제거한다. 사용자가 지정한 앵커와 출발/도착
    // 항목은 절대 건드리지 않는다.
    const endLocationForCleanup = getLocationName(constraints.endLocation);
    if (endLocationForCleanup) {
      const looksLikeTransitNarration = (item) => (
        item.type !== 'AnchorSchedule' &&
        item.type !== 'departure' &&
        item.type !== 'arrival' &&
        /(?:으로\s*이동|이동\s*(?:준비|중)?)\s*$/.test(asNonEmptyString(item.title)) &&
        !isSameLocation(item.location, endLocationForCleanup)
      );
      scheduleItems = scheduleItems.filter(item => !looksLikeTransitNarration(item));
    }

    const startLocation = getLocationName(constraints.startLocation);
    if (startLocation) {
      const requiredStart = makeBoundaryItem('departure', constraints.startLocation, constraints.startTime, isKo);
      if (scheduleItems[0] && scheduleItems[0].type !== 'AnchorSchedule' &&
          !scheduleItems[0].placeIntent?.purpose &&
          isSameLocation(scheduleItems[0].selectedPlace || scheduleItems[0].location, constraints.startLocation)) {
        scheduleItems[0] = {
          ...scheduleItems[0],
          // AI 가 만든 항목을 출발 지점으로 승격한다. type 까지 맞춰야
          // 타임라인이 다른 방문지가 아니라 경계 항목으로 렌더링한다.
          type: 'departure',
          time: constraints.startTime || scheduleItems[0].time,
          endTime: '',
          duration: requiredStart.duration,
          location: startLocation,
          ...selectedFields(constraints.startLocation),
          googleMapsUrl: mapsSearchUrl(startLocation)
        };
      } else {
        scheduleItems.unshift(requiredStart);
      }
    }

    const endLocation = getLocationName(constraints.endLocation);
    if (endLocation) {
      const requiredEnd = makeBoundaryItem('arrival', constraints.endLocation, constraints.endTime, isKo);
      const lastIndex = scheduleItems.length - 1;
      if (scheduleItems[lastIndex] && scheduleItems[lastIndex].type !== 'AnchorSchedule' &&
          !scheduleItems[lastIndex].placeIntent?.purpose &&
          isSameLocation(scheduleItems[lastIndex].selectedPlace || scheduleItems[lastIndex].location, constraints.endLocation)) {
        scheduleItems[lastIndex] = {
          ...scheduleItems[lastIndex],
          // 위와 같은 이유로 도착 지점으로 승격한다("인천 도착" 처럼 AI 가
          // 목적지에 붙여 놓은 항목이 일반 카드로 남지 않게 한다).
          type: 'arrival',
          time: constraints.endTime || scheduleItems[lastIndex].time,
          endTime: '',
          duration: requiredEnd.duration,
          location: endLocation,
          ...selectedFields(constraints.endLocation),
          googleMapsUrl: mapsSearchUrl(endLocation)
        };
      } else {
        scheduleItems.push(requiredEnd);
      }
    }

    // 이동수단·소요시간·교통비의 단일 기준은 지도 경로 결과다. 모델 응답이
    // 프롬프트를 어기거나 구버전 응답을 돌려줘도 일정 상태에 AI 이동 설명을
    // 남기지 않는다. 출발/도착은 방문지가 아니므로 장소 비용도 비운다.
    scheduleItems = scheduleItems.map(item => {
      const boundary = item.type === 'departure' || item.type === 'arrival';
      const practicalInfo = boundary && item.practicalInfo && typeof item.practicalInfo === 'object'
        ? { ...item.practicalInfo, estimatedCost: '' }
        : item.practicalInfo;
      return { ...item, transitInfo: '', ...(practicalInfo ? { practicalInfo } : {}) };
    });

    return { ...day, day: dayNumber, scheduleItems };
  });
}
