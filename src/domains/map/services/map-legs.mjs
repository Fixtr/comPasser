/**
 * 지도 구간 넘기기에 올릴 목록과 한 줄 설명을 만든다.
 *
 * 선이 그려진 구간만 고를 수 있다. 같은 장소 안 이동(`samePlace`)은 선이 없고,
 * 장소를 찾지 못한 구간은 결과 자체가 없다. 순수 계산이라 문구는 `t` 로 받는다.
 */

const LINE_FORMATS = {
  BUS: 'busFormat', INTERCITY_BUS: 'busFormat',
  SUBWAY: 'subwayFormat', HEAVY_RAIL: 'subwayFormat', COMMUTER_TRAIN: 'subwayFormat',
  TRAIN: 'trainFormat', HIGH_SPEED_TRAIN: 'trainFormat',
};

function durationText(minutes, t) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return t('durationMinutes').replace('{0}', mins);
  return mins ? t('durationHoursMinutes').replace('{0}', hours).replace('{1}', mins) : t('durationHours').replace('{0}', hours);
}

function travelText(route, t) {
  if (route.estimated && Number.isFinite(route.durationMinutes)) {
    return t(route.mode === 'TRANSIT' ? 'estimatedTransitDuration' : 'estimatedWalkDuration').replace('{0}', route.durationMinutes);
  }
  const duration = durationText(route.displayMinutes ?? route.durationMinutes, t);
  // 시간을 재지 못한 구간(점선)에는 수단도 적지 않는다. 걸어간다는 근거가 없다.
  if (!duration) return '';
  const format = LINE_FORMATS[String(route.vehicleType || '').toUpperCase()];
  const mode = route.mode !== 'TRANSIT' ? t('walkText')
    : (format && route.lineName ? t(format).replace('{0}', route.lineName) : route.lineName || t('transitText'));
  return `${mode} ${duration}`;
}

/**
 * @param {Array} routes `transit-info-ready` 로 보내는 구간 결과
 * @param {Array} scheduleItems 그날의 일정 항목(구간의 `fromIndex` 가 이 배열의 자리다)
 * @param {(key: string) => string} t
 * @returns {Array<{fromIndex: number, toIndex: number, label: string, description: string}>}
 */
export function buildLegList(routes, scheduleItems = [], t = key => key) {
  return (routes || []).filter(route => route && !route.samePlace && Number.isInteger(route.fromIndex)).map(route => {
    const toIndex = Number.isInteger(route.toIndex) ? route.toIndex : route.fromIndex + 1;
    const names = [scheduleItems?.[route.fromIndex]?.title, scheduleItems?.[toIndex]?.title].filter(Boolean).join(' → ');
    return {
      fromIndex: route.fromIndex,
      toIndex,
      label: `${route.fromIndex + 1} → ${toIndex + 1}`,
      description: [names, travelText(route, t)].filter(Boolean).join(' · '),
    };
  });
}
