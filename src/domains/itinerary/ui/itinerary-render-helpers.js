import { t } from '../../../utils/i18n.js';
import { escapeHtml } from '../../../utils/html-safety.mjs';
import { minutesOf as clock, routeDepartureClock } from '../services/itinerary-schedule-adjust.mjs';

/**
 * itinerary-view.js 의 대중교통/일정 요약 렌더링 로직. nav-popup.js 와 같은
 * 패턴 — 컴포넌트 인스턴스(this) 대신 shadowRoot 를 명시적으로 받는 독립
 * 함수로 분리해 render()/데이터 로딩 로직과 책임을 나눈다. 동작 변경 없음.
 */

/**
 * 이동 수단 칩의 표기.
 *
 * 예전에는 수단마다 다른 색을 썼다(버스=초록, 지하철=파랑, 기차=보라,
 * 택시=노랑). 그런데 이 화면에서 색은 이미 다른 뜻을 갖는다 —
 * map/COMMAND_GUIDE.md 가 정한 대로 보라는 고정 일정, 초록은 그날의 첫
 * 장소, 파랑은 나머지 방문지다. 수단까지 색을 쓰면 같은 초록이 어떤 줄에서는
 * "첫 장소", 다른 줄에서는 "버스"를 뜻하게 된다.
 *
 * 수단은 아이콘과 라벨로 이미 구분되므로 색을 회수하고 무채색으로 통일한다.
 * 그러면 화면에 남는 색 셋은 전부 지도 핀과 같은 뜻이 된다.
 *
 * 아이콘은 이모지 대신 인라인 SVG 다. 이모지는 OS 마다 모양과 색이 달라
 * 무채색 규칙이 기기별로 깨지고, 캡처 결과도 기기마다 달라진다.
 */
const ICON = {
  walk: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="2.6" r="1.4"/><path d="M8.6 5.2 6.6 6.6l-1 3M8.6 5.2l2 1.2.9 2.2M8.6 5.2 8 9l2 1.6.6 3.2M8 9l-2.2 2-.4 2.8"/></svg>',
  bus:  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2" width="11" height="9.5" rx="1.2"/><path d="M2.5 7.5h11M5 11.5v1.6M11 11.5v1.6"/><circle cx="5.2" cy="9.5" r=".55" fill="currentColor" stroke="none"/><circle cx="10.8" cy="9.5" r=".55" fill="currentColor" stroke="none"/></svg>',
  subway: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="2" width="10" height="10" rx="2.4"/><path d="M3 7.2h10M5.4 14l1.4-2M10.6 14l-1.4-2"/><circle cx="5.6" cy="9.6" r=".55" fill="currentColor" stroke="none"/><circle cx="10.4" cy="9.6" r=".55" fill="currentColor" stroke="none"/></svg>',
  train: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.6C4 3.2 6 2.4 8 2.4s4 .8 5.5 2.2v4.9a1.6 1.6 0 0 1-1.6 1.6H4.1a1.6 1.6 0 0 1-1.6-1.6z"/><path d="M2.5 7h11M4.6 13.6 6 11.1M11.4 13.6 10 11.1"/></svg>',
  taxi: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10.4h12M3.4 10.4 4.6 6.6h6.8l1.2 3.8M6 6.6V4.4h4v2.2"/><rect x="2" y="10.4" width="12" height="2.6" rx=".8"/><circle cx="5" cy="13" r=".6" fill="currentColor" stroke="none"/><circle cx="11" cy="13" r=".6" fill="currentColor" stroke="none"/></svg>',
};

/** 수단과 무관하게 같은 무채색 칩. 색은 지도 마커 규칙에만 쓴다. */
function chip(icon, label) {
  return {
    icon,
    bg: 'var(--cp-sunken)',
    border: 'var(--cp-rule)',
    color: 'var(--cp-ink-2)',
    label,
  };
}

export function getTransitStyle(mode, vehicleType) {
  if (mode === 'WALKING') return chip(ICON.walk, '도보');

  if (mode === 'TRANSIT' && vehicleType) {
    const vType = vehicleType.toUpperCase();
    if (vType === 'BUS' || vType === 'INTERCITY_BUS') return chip(ICON.bus, '버스');
    if (vType === 'SUBWAY' || vType === 'HEAVY_RAIL' || vType === 'COMMUTER_TRAIN') return chip(ICON.subway, '지하철');
    if (vType === 'TRAIN' || vType === 'HIGH_SPEED_TRAIN') return chip(ICON.train, '기차');
    if (vType === 'TAXI' || vType === 'CAB') return chip(ICON.taxi, '택시');
  }

  return chip(ICON.bus, '대중교통');
}

export function getTransitModeText(vehicleType, lineName) {
  const vType = (vehicleType || '').toUpperCase();
  const name = lineName || '';

  if (vType === 'BUS' || vType === 'INTERCITY_BUS') {
    const format = t('busFormat');
    return format ? format.replace('{0}', name) : `${name} Bus`;
  }
  if (vType === 'SUBWAY' || vType === 'HEAVY_RAIL' || vType === 'COMMUTER_TRAIN') {
    const format = t('subwayFormat');
    return format ? format.replace('{0}', name) : `Line ${name}`;
  }
  if (vType === 'TRAIN' || vType === 'HIGH_SPEED_TRAIN') {
    const format = t('trainFormat');
    return format ? format.replace('{0}', name) : `Train ${name}`;
  }
  return name || t('transitText') || '대중교통';
}

export function renderTransitStep(step) {
  if (step.mode === 'TRANSIT') {
    const style = getTransitStyle('TRANSIT', step.vehicleType);
    const modeText = getTransitModeText(step.vehicleType, step.lineName);
    const stopsFormat = t('stopsCount') || '{0}개 정류장';
    const stopsCount = step.numStops ? ` · ${stopsFormat.replace('{0}', step.numStops)}` : '';
    const boarding = t('boarding') || '승차';
    const alighting = t('alighting') || '하차';
    const stopsHtml = (step.departureStop && step.arrivalStop)
      ? `<div class="step-stops">[${escapeHtml(boarding)}] ${escapeHtml(step.departureStop)} &rarr; [${escapeHtml(alighting)}] ${escapeHtml(step.arrivalStop)}</div>`
      : '';

    return `
      <div class="transit-step" style="background:${style.bg}; border-color:${style.border};">
        <span class="step-icon">${style.icon}</span>
        <span class="step-main" style="color:${style.color};">${escapeHtml(modeText)}</span>
        <span class="step-time">${escapeHtml(step.duration)}${escapeHtml(stopsCount)}</span>
        ${stopsHtml}
      </div>`;
  }

  // WALKING 및 기타 구간
  return `
    <div class="transit-step walk">
      <span class="step-icon">${getTransitStyle('WALKING').icon}</span>
      <span class="step-main">${escapeHtml(t('walkText') || '도보')}</span>
      <span class="step-time">${escapeHtml(step.duration)}${step.distance ? ` (${escapeHtml(step.distance)})` : ''}</span>
    </div>`;
}

export function renderTransitInfo(shadowRoot, transitRoutes, items = []) {
  // 새 데이터 수신 시 이전 이동 카드 초기화
  shadowRoot.querySelectorAll('.transit-info').forEach(el => {
    el.classList.add('hidden');
    el.innerHTML = '';
  });

  transitRoutes.forEach(detail => {
    const el = shadowRoot.getElementById(`transit-info-${detail.fromIndex}`);
    if (!el) return;

    const destIndex = typeof detail.toIndex === 'number' ? detail.toIndex : detail.fromIndex + 1;

    // 실제 경로 데이터가 도착한 구간은 Gemini 추정치(안내문/이동시간)를 감춤
    const destCard = shadowRoot.querySelector(`.schedule-card[data-index="${destIndex + 1}"]`);
    if (destCard) {
      destCard.querySelectorAll('.gemini-transit, .gemini-transit-meta, .gemini-transport-cost').forEach(node => {
        node.style.display = 'none';
      });
    }

    // 어느 카드 사이의 이동인지 명시 (핀 번호 = 카드 번호와 동일 체계)
    const headerFormat = t('transitSegHeader') || '{0}번 → {1}번 이동';
    const headerText = headerFormat
      .replace('{0}', detail.fromIndex + 1)
      .replace('{1}', destIndex + 1);

    const fromEnd = clock(routeDepartureClock(items[detail.fromIndex]));
    const toStart = clock(items[destIndex]?.time);
    const spare = fromEnd !== null && toStart !== null && Number.isFinite(detail.durationMinutes) && detail.durationMinutes >= 0
      ? toStart - fromEnd - Math.ceil(detail.durationMinutes) : 0;
    const freeTime = spare >= 30 ? `<div class="schedule-free-time" role="note">${escapeHtml(t('scheduleFreeTime').replace('{0}', spare))}</div>` : '';
    // 같은 장소에서 이어지는 일정은 이동 자체가 없다. "도보 0분" 같은
    // 빈 카드 대신 그 사실을 그대로 알려준다.
    if (detail.samePlace) {
      el.innerHTML = `
        <div class="transit-seg-card">
          <div class="transit-seg-header">
            <span>${escapeHtml(headerText)}</span>
            <span class="transit-seg-total">${escapeHtml(t('samePlaceLabel') || '같은 장소 · 이동 없음')}</span>
          </div>
          ${freeTime}
        </div>
      `;
      el.classList.remove('hidden');
      return;
    }

    const steps = Array.isArray(detail.steps) ? detail.steps : [];
    let stepsHtml = '';
    if (steps.length > 0) {
      stepsHtml = steps.map(step => renderTransitStep(step)).join('');
    } else if (detail.mode === 'WALKING') {
      stepsHtml = renderTransitStep({ mode: 'WALKING', duration: detail.duration || '', distance: detail.distance || '' });
    } else {
      // 구버전 데이터 폴백: 단일 요약 스텝
      stepsHtml = renderTransitStep({
        mode: 'TRANSIT',
        duration: detail.duration || '',
        distance: detail.distance || '',
        vehicleType: detail.vehicleType,
        lineName: detail.lineName,
        departureStop: detail.transitDetailsExtended?.departureStop || '',
        arrivalStop: detail.transitDetailsExtended?.arrivalStop || '',
        numStops: null
      });
    }

    const totalFormat = t('transitTotal') || '총 {0}';
    const totalText = detail.duration
      ? `${totalFormat.replace('{0}', detail.duration)}${detail.distance ? ` · ${detail.distance}` : ''}`
      : '';

    el.innerHTML = `
      <div class="transit-seg-card">
        <div class="transit-seg-header">
          <span>${escapeHtml(headerText)}</span>
          ${totalText ? `<span class="transit-seg-total">${escapeHtml(totalText)}</span>` : ''}
        </div>
        <div class="transit-steps">${stepsHtml}</div>
        ${(Array.isArray(detail.warnings) ? detail.warnings : []).map(warning => `<div role="note">${escapeHtml(warning)}</div>`).join('')}
        ${freeTime}
        ${detail.directionsUrl ? `<div class="transit-verify">${escapeHtml(t('transitVerify') || '구글 지도에서 경로 확인')}</div>` : ''}
      </div>
    `;

    // 카드 클릭 → 구글 지도 대중교통 길찾기로 해당 구간 검증
    if (detail.directionsUrl) {
      const card = el.querySelector('.transit-seg-card');
      card.classList.add('clickable');
      card.addEventListener('click', () => window.open(detail.directionsUrl, '_blank', 'noopener'));
    }

    el.classList.remove('hidden');
  });
}
