/**
 * travel-form.js 의 Shadow DOM에서 폼 입력값을 읽어 plannerRequest 형태로
 * 조립한다. nav-popup.js 와 같은 패턴 — 컴포넌트 인스턴스(this) 대신
 * shadowRoot 를 명시적으로 받는 독립 함수로 분리해, render()/이벤트 배선과
 * "폼 → 데이터" 책임을 나눈다.
 */

import { readPlaceInput } from '../services/selected-place.mjs';

export function getAutocompleteValue(element) {
  if (!element) return '';
  // 만약 element.value가 문자열이고 비어있지 않다면 리턴
  if (typeof element.value === 'string' && element.value.trim() !== '') {
    return readPlaceInput(element, element.value.trim());
  }
  // Shadow DOM 내부의 input 요소에서 실제 텍스트 값 추출 시도
  const shadowInput = element.shadowRoot?.querySelector('input');
  if (shadowInput && shadowInput.value) {
    return shadowInput.value.trim();
  }
  // 일반 자식으로 존재할 수 있는 input 확인
  const normalInput = element.querySelector('input');
  if (normalInput && normalInput.value) {
    return normalInput.value.trim();
  }
  return '';
}

export function getFormData(shadowRoot, draft = {}) {
  const anchorsElements = shadowRoot.querySelectorAll('.anchor-item');
  const anchors = Array.from(anchorsElements).map(el => {
    const daySelect = el.querySelector('.anchor-day');
    const flexible = el.querySelector('.anchor-flexible')?.checked === true;
    return {
      name: el.querySelector('.anchor-name').value,
      time: flexible ? '' : el.querySelector('.anchor-time').value,
      endTime: flexible ? '' : el.querySelector('.anchor-end-time').value,
      location: getAutocompleteValue(el.querySelector('.anchor-location')),
      day: daySelect ? parseInt(daySelect.value, 10) : 1,
      ...(flexible ? { flexible: true, stayMinutes: Number(el.dataset.stayMinutes) || 60 } : {})
    };
  }).filter(a => a.name || a.time || a.endTime || a.location || a.flexible);

  // The caller supplies the same draft used to paint the form. A read-only
  // date is presentation text, so use that draft's raw dates, not global storage.
  const { theme = null, budget = null, date: draftDates = [] } = draft;
  const dateInput = shadowRoot.getElementById('schedule-date');
  let finalDate = structuredClone(draftDates);
  if (dateInput && !dateInput.readOnly) {
    finalDate = dateInput.value;
  }

  const globalStartTime = shadowRoot.getElementById('start-time').value;
  const globalEndTime = shadowRoot.getElementById('end-time').value;

  // Check toggle state for daily times
  const toggle = shadowRoot.getElementById('daily-times-toggle');
  let dailyTimes = null;

  if (toggle && toggle.checked) {
    const rows = shadowRoot.querySelectorAll('.daily-time-row');
    if (rows.length > 0) {
      dailyTimes = Array.from(rows).map(row => ({
        day: parseInt(row.dataset.day, 10),
        startTime: row.querySelector('.daily-start-time').value,
        endTime: row.querySelector('.daily-end-time').value,
        isCustom: true
      }));
    }
  } else if (Array.isArray(finalDate) && finalDate.length > 1) {
    // Create identical dailyTimes array based on global if toggled off
    dailyTimes = finalDate.map((d, idx) => ({
      day: idx + 1,
      startTime: globalStartTime,
      endTime: globalEndTime,
      isCustom: false
    }));
  }

  return {
    date: finalDate,
    startTime: globalStartTime,
    endTime: globalEndTime,
    dailyTimes: dailyTimes,
    startLocation: getAutocompleteValue(shadowRoot.getElementById('start-location')),
    endLocation: getAutocompleteValue(shadowRoot.getElementById('end-location')),
    selectedWaypoints: structuredClone(draft.selectedWaypoints || []),
    anchorSchedules: anchors,
    theme,
    budget
  };
}
