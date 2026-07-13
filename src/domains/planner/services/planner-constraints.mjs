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

    scheduleItems.sort((a, b) => minutes(a.time) - minutes(b.time));

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
