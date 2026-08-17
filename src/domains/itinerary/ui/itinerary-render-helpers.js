import { t } from '../../../utils/i18n.js';

/**
 * itinerary-view.js 의 대중교통/일정 요약 렌더링 로직. nav-popup.js 와 같은
 * 패턴 — 컴포넌트 인스턴스(this) 대신 shadowRoot 를 명시적으로 받는 독립
 * 함수로 분리해 render()/데이터 로딩 로직과 책임을 나눈다. 동작 변경 없음.
 */

export function getTransitStyle(mode, vehicleType) {
  if (mode === 'WALKING') {
    return { icon: '🚶', bg: '#f3f4f6', border: '#d1d5db', color: '#4b5563', label: '도보' };
  }
  if (mode === 'TRANSIT' && vehicleType) {
    const vType = vehicleType.toUpperCase();
    if (vType === 'BUS' || vType === 'INTERCITY_BUS') {
      return { icon: '🚌', bg: '#ecfdf5', border: '#a7f3d0', color: '#065f46', label: '버스' };
    }
    if (vType === 'SUBWAY' || vType === 'HEAVY_RAIL' || vType === 'COMMUTER_TRAIN') {
      return { icon: '🚇', bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af', label: '지하철' };
    }
    if (vType === 'TRAIN' || vType === 'HIGH_SPEED_TRAIN') {
      return { icon: '🚆', bg: '#f5f3ff', border: '#ddd6fe', color: '#5b21b6', label: '기차' };
    }
    if (vType === 'TAXI' || vType === 'CAB') {
      return { icon: '🚕', bg: '#fefce8', border: '#fde68a', color: '#92400e', label: '택시' };
    }
  }
  // Default transit
  return { icon: '🚌', bg: '#ecfdf5', border: '#a7f3d0', color: '#065f46', label: '대중교통' };
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
      ? `<div class="step-stops">[${boarding}] ${step.departureStop} ➔ [${alighting}] ${step.arrivalStop}</div>`
      : '';

    return `
      <div class="transit-step" style="background:${style.bg}; border-color:${style.border};">
        <span class="step-icon">${style.icon}</span>
        <span class="step-main" style="color:${style.color};">${modeText}</span>
        <span class="step-time">${step.duration}${stopsCount}</span>
        ${stopsHtml}
      </div>`;
  }

  // WALKING 및 기타 구간
  return `
    <div class="transit-step walk">
      <span class="step-icon">🚶</span>
      <span class="step-main">${t('walkText') || '도보'}</span>
      <span class="step-time">${step.duration}${step.distance ? ` (${step.distance})` : ''}</span>
    </div>`;
}

export function renderTransitInfo(shadowRoot, transitRoutes) {
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
      destCard.querySelectorAll('.gemini-transit, .gemini-transit-meta').forEach(node => {
        node.style.display = 'none';
      });
    }

    // 어느 카드 사이의 이동인지 명시 (핀 번호 = 카드 번호와 동일 체계)
    const headerFormat = t('transitSegHeader') || '{0}번 → {1}번 이동';
    const headerText = headerFormat
      .replace('{0}', detail.fromIndex + 1)
      .replace('{1}', destIndex + 1);

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
          <span>${headerText}</span>
          ${totalText ? `<span class="transit-seg-total">${totalText}</span>` : ''}
        </div>
        <div class="transit-steps">${stepsHtml}</div>
        ${detail.directionsUrl ? `<div class="transit-verify">${t('transitVerify') || '🔎 구글 지도에서 경로 확인'}</div>` : ''}
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

