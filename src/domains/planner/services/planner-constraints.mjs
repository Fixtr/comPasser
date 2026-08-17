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
      startTime: dayTimes.startTime || existingDay.startTime || plannerRequest.startTime || '',
      endTime: dayTimes.endTime || existingDay.endTime || plannerRequest.endTime || '',
      startLocation: existingDay.startLocation || plannerRequest.startLocation || '',
      endLocation: existingDay.endLocation || plannerRequest.endLocation || '',
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

function makeBoundaryItem(kind, location, time, isKo) {
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
    description: isKo ? '사용자가 지정한 필수 일정입니다.' : 'A required schedule selected by the user.',
    location,
    duration: isKo ? '고정 일정' : 'Fixed schedule',
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
  const sameTitle = titlesLooselyMatch(item.title, anchor.name);
  const sameTime = isSameTime(item.time, anchor.time);
  const samePlace = isSameLocation(item.location, anchor.location);

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

    // 정렬은 AI가 낸(자정 넘김을 그냥 "01:33"처럼 표기한) 원래 순서를
    // 기준으로 자정 넘김을 판단해야 한다 — 이미 뒤섞인 뒤에는 판단 기준이
    // 없다. decorate-sort-undecorate로 원래 인덱스에 계산된 정렬키를
    // 붙여서 정렬한다.
    const chronoKeys = toChronologicalMinutes(scheduleItems);
    scheduleItems = scheduleItems
      .map((item, idx) => ({ item, key: chronoKeys[idx] }))
      .sort((a, b) => a.key - b.key)
      .map(({ item }) => item);

    // Gemini sometimes appends an extra item past the requested end time
    // (e.g. a bogus "moving to the airport" stop that runs past midnight —
    // e.g. "01:33" the next morning) instead of ending the day exactly at
    // endLocation/endTime. If left in place, the end-location fix below
    // can't find a matching last item and pushes the real arrival after
    // it — producing a non-chronological order where the pushed
    // (earlier-time) arrival sits after a later-time item. Drop anything
    // the AI scheduled at/after the day's end time first, so the array's
    // last item is always a legitimate one. Now-sorted order lets
    // toChronologicalMinutes correctly treat any post-midnight time as
    // "next day" rather than mistaking it for early morning.
    const endTimeMinutes = minutes(constraints.endTime);
    if (endTimeMinutes !== Number.MAX_SAFE_INTEGER) {
      const sortedChronoKeys = toChronologicalMinutes(scheduleItems);
      scheduleItems = scheduleItems.filter((item, idx) => (
        item.type === 'AnchorSchedule' || sortedChronoKeys[idx] < endTimeMinutes
      ));
    }

    // Gemini는 종종 마지막 이동을 "서울역으로 이동" -> "인천국제공항으로
    // 이동"처럼 여러 개의 가짜 "이동" 항목으로 서술한다(실제로는 하나의
    // 다구간 여정일 뿐이고, transitInfo/지도 레이어가 이미 환승 정보를
    // 카드로 보여준다). 목적지에 아직 도착하지 않은(=endLocation과 다른)
    // 이런 항목들을 배열 끝에서부터 제거해, 마지막 실제 방문 다음에 바로
    // 도착 항목이 오도록 한다.
    const endLocationForCleanup = getLocationName(constraints.endLocation);
    if (endLocationForCleanup) {
      const looksLikeTransitNarration = (item) => (
        item.type !== 'AnchorSchedule' &&
        item.type !== 'departure' &&
        item.type !== 'arrival' &&
        /(?:으로\s*이동|이동\s*(?:준비|중)?)\s*$/.test(asNonEmptyString(item.title)) &&
        !isSameLocation(item.location, endLocationForCleanup)
      );
      while (scheduleItems.length > 0 && looksLikeTransitNarration(scheduleItems[scheduleItems.length - 1])) {
        scheduleItems.pop();
      }
    }

    const startLocation = getLocationName(constraints.startLocation);
    if (startLocation) {
      const requiredStart = makeBoundaryItem('departure', startLocation, constraints.startTime, isKo);
      if (scheduleItems[0] && isSameLocation(scheduleItems[0].location, startLocation)) {
        scheduleItems[0] = {
          ...scheduleItems[0],
          time: constraints.startTime || scheduleItems[0].time,
          location: startLocation,
          googleMapsUrl: mapsSearchUrl(startLocation)
        };
      } else {
        scheduleItems.unshift(requiredStart);
      }
    }

    const endLocation = getLocationName(constraints.endLocation);
    if (endLocation) {
      const requiredEnd = makeBoundaryItem('arrival', endLocation, constraints.endTime, isKo);
      const lastIndex = scheduleItems.length - 1;
      if (scheduleItems[lastIndex] && isSameLocation(scheduleItems[lastIndex].location, endLocation)) {
        scheduleItems[lastIndex] = {
          ...scheduleItems[lastIndex],
          endTime: constraints.endTime || scheduleItems[lastIndex].endTime,
          location: endLocation,
          googleMapsUrl: mapsSearchUrl(endLocation)
        };
      } else {
        scheduleItems.push(requiredEnd);
      }
    }

    return { ...day, day: dayNumber, scheduleItems };
  });
}
