import { t } from '../../../utils/i18n.js';
import { escapeHtml, safeHttpUrl } from '../../../utils/html-safety.mjs';
import { icons } from '../../../ui/icons.js';
import { isVisitableStop } from '../services/visited-stops.mjs';
import { isTransportEstimatedCost } from '../services/itinerary-cost.mjs';
import { isEditableItem } from '../services/itinerary-edit.mjs';
import { minutesOf } from '../services/itinerary-schedule-adjust.mjs';

/**
 * 체류 시간 표시값. AI 의 duration 문구는 언어·형식이 제각각("2 hours", "01:30")이라
 * 시각이 있으면 시각으로 화면 언어에 맞춰 만들고, 없을 때만 저장된 문구를 쓴다.
 */
function fallbackDuration(item) {
  const start = minutesOf(item?.time);
  const end = minutesOf(item?.endTime);
  if (start === null || end === null || end <= start) return '';

  const total = end - start;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return t('durationHoursMinutes').replace('{0}', hours).replace('{1}', mins);
  if (hours) return t('durationHours').replace('{0}', hours);
  return t('durationMinutes').replace('{0}', mins);
}

// visited is undefined when the trip has no stable id, so no visited toggle is drawn.
export function renderScheduleCard(scheduleItem, idx, editable, visited) {
  const timeDisplay = scheduleItem.endTime ? `${escapeHtml(scheduleItem.time)} -<br>${escapeHtml(scheduleItem.endTime)}` : escapeHtml(scheduleItem.time);

  // location이 객체(좌표)일 수 있으므로 안전하게 문자열 변환
  const locationStr = typeof scheduleItem.location === 'string'
    ? scheduleItem.location
    : (scheduleItem.location ? JSON.stringify(scheduleItem.location) : '');
  const gmapsStr = safeHttpUrl(scheduleItem.googleMapsUrl);
  const officialUrl = safeHttpUrl(scheduleItem.officialWebsiteUrl);

  // 출발/도착은 사용자가 폼에서 지정한 경계라 편집 대상이 아니다.
  const editHtml = editable && isEditableItem(scheduleItem) ? `
    <div class="item-edit-actions">
      <button class="item-edit-btn" data-edit="up" data-idx="${idx}" aria-label="${escapeHtml(t('moveUpAria').replace('{0}', scheduleItem.title))}" data-i18n-title="moveUpTitle" title="${t('moveUpTitle')}">↑</button>
      <button class="item-edit-btn" data-edit="down" data-idx="${idx}" aria-label="${escapeHtml(t('moveDownAria').replace('{0}', scheduleItem.title))}" data-i18n-title="moveDownTitle" title="${t('moveDownTitle')}">↓</button>
      <button class="item-edit-btn danger" data-edit="remove" data-idx="${idx}" aria-label="${escapeHtml(t('removeItemAria').replace('{0}', scheduleItem.title))}" data-i18n-title="removeItemTitle" title="${t('removeItemTitle')}">✕</button>
    </div>
  ` : '';

  const isRecommendation = !['departure', 'arrival', 'AnchorSchedule'].includes(scheduleItem.type) && Object.hasOwn(scheduleItem, 'placeIntent');
  // An unset stay stands for a whole city, so reviews and directions to it would mislead.
  const linksHtml = scheduleItem.stayUnsetLabel ? '' : `
    <div class="action-links" ${isRecommendation && scheduleItem.placeStatus !== 'verified' ? 'hidden' : ''}>
      ${officialUrl ? `<a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer" class="action-link-badge">${icons.info} <span data-i18n="officialSiteBtn">${t('officialSiteBtn')}</span></a>` : ''}
      ${gmapsStr || isRecommendation ? `<a href="${escapeHtml(gmapsStr)}" target="_blank" rel="noopener noreferrer" class="action-link-badge primary">${icons.search} <span data-i18n="reviewsBtn">${t('reviewsBtn')}</span></a>` : ''}
      <button class="nav-btn" data-location="${escapeHtml(locationStr)}" data-gmaps="${escapeHtml(gmapsStr)}">${icons.route} <span data-i18n="directionsBtn">${t('directionsBtn')}</span></button>
    </div>
  `;

  return `
    <div class="time-badge">${timeDisplay}</div>
    <div class="schedule-card" data-type="${escapeHtml(scheduleItem.type)}" data-index="${idx + 1}"${scheduleItem.addedByUser ? ' data-added="true"' : ''}${visited ? ' data-visited="true"' : ''}>
      <div class="schedule-title-row">
        <span class="schedule-title">${escapeHtml(scheduleItem.title)}</span>
        ${editHtml}
      </div>
      ${visited === undefined || !isVisitableStop(scheduleItem) ? '' : `<button type="button" class="visited-btn" aria-pressed="${visited}" aria-label="${escapeHtml(t('visitedAria').replace('{0}', scheduleItem.title))}"><span aria-hidden="true">✓</span> ${escapeHtml(t('visitedBtn'))}</button>`}
      ${(function() {
        const info = scheduleItem.transitInfo;
        if (typeof info !== 'string' || !info) return '';

        const trimmedInfo = info.trim();
        // 강화된 필터링 키워드
        const skipKeywords = ['없음', '이동 완료', '정보 없음', 'null', 'undefined'];
        if (trimmedInfo === '' || skipKeywords.some(k => trimmedInfo.includes(k))) return '';

        // 색은 지도 마커 규칙에만 쓴다(보라=고정, 초록=첫 장소, 파랑=나머지).
        // 이동 안내가 초록을 쓰면 같은 초록이 두 가지를 뜻하게 된다.
        return `<div class="schedule-desc gemini-transit">${icons.route}<span>${t('unverifiedTransitGuideLabel') || 'AI 예상 이동 · 확인 필요'} · ${escapeHtml(trimmedInfo)}</span></div>`;
      })()}
      <div class="resolved-place" ${isRecommendation ? '' : 'hidden'}>${isRecommendation ? escapeHtml(t(scheduleItem.placeStatus === 'verified' ? 'recommendationVerified' : scheduleItem.placeStatus === 'unresolved' ? 'recommendationUnresolved' : 'recommendationPending')) : ''}</div>
      <p class="visit-hours" role="status" ${['departure', 'arrival'].includes(scheduleItem.type) ? 'hidden' : ''}></p>
      ${editable && !['departure','arrival','AnchorSchedule'].includes(scheduleItem.type) ? `<button type="button" class="visit-time-btn replace-place-btn-style">${escapeHtml(t('visitTimeBtn'))}</button>` : ''}
      ${editable && !['departure', 'arrival', 'AnchorSchedule'].includes(scheduleItem.type) ? `<button type="button" class="replace-place-btn">${escapeHtml(t('replacePlaceBtn'))}</button>` : ''}
      ${editable && !visited && !['departure', 'arrival', 'AnchorSchedule'].includes(scheduleItem.type) ? `<button type="button" class="indoor-alternatives-btn">${escapeHtml(t('indoorAlternativesFind'))}</button>` : ''}
      <div class="schedule-meta">
        <span class="meta-item">${icons.pin} ${escapeHtml(scheduleItem.stayUnsetLabel || locationStr)}</span>
        <span class="meta-item">${icons.clock} ${escapeHtml(fallbackDuration(scheduleItem) || scheduleItem.duration || '')}${(function() {
          const info = typeof scheduleItem.transitInfo === 'string' ? scheduleItem.transitInfo : '';
          // 시간 정보 추출 정규식 (예: 약 15분, 1시간 10분 등)
          const timeMatch = info.match(/(?:약\s*)?(\d+\s*시간)?\s*(\d+\s*분)/);
          if (timeMatch) {
            const transitTime = timeMatch[0];
            // 전체 소요 시간과 이동 시간이 다른 경우 혹은 이동 관련 키워드가 있는 경우에만 표시
            if (scheduleItem.duration !== transitTime || info.includes('이동') || info.includes('도보')) {
               return ` <span class="gemini-transit-meta" style="opacity: 0.8; font-weight: normal; font-size: 0.85em;">${t('transitTimeMeta').replace('{0}', transitTime)}</span>`;
            }
          }
          return '';
        })()}</span>
      </div>
      ${(function() {
        const info = scheduleItem.practicalInfo;
        if (!info) return '';
        // 읽기 화면에서는 접어 둔다. 내용은 그대로이고 펼치면 전과 같다.
        const details = html => `<details class="schedule-details">
          <summary data-i18n="scheduleDetails">${escapeHtml(t('scheduleDetails'))}</summary>${html}</details>`;

        // Structured Object Format (Phase 4)
        if (typeof info === 'object' && !Array.isArray(info)) {
          const recs = info.top3Recommendations;
          const itemType = scheduleItem.type || '';
          const isDining = itemType === 'dining';
          const isCafe = itemType === 'cafe';

          // 객체 배열 포맷 (신규)
          let recsHtml = '';
          if (Array.isArray(recs) && recs.length > 0) {
            const recIcon = isDining ? icons.dining : isCafe ? icons.cafe : icons.star;
            const recLabel = isDining ? '추천 식당 Top 3' : isCafe ? '추천 카페 Top 3' : '추천 Top 3';
            const recItemsHtml = recs.filter(rec => rec && typeof rec === 'object').map((rec, i) => {
              const safeName = escapeHtml(rec.name);
              const reviewHref = safeHttpUrl(rec.reviewUrl) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rec.name || '')}`;
              const dirHref = safeHttpUrl(rec.directionUrl) || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(rec.name || '')}`;
              return `<div class="rec-item">
                <span class="rec-rank">${i + 1}.</span>
                <span class="rec-name">${safeName}</span>
                <span class="rec-rating">${icons.star} ${escapeHtml(rec.rating)}</span>
                <a href="${escapeHtml(reviewHref)}" target="_blank" rel="noopener noreferrer" class="rec-btn review">${icons.list} <span data-i18n="reviewsBtn">${t('reviewsBtn')}</span></a>
                <a href="${escapeHtml(dirHref)}" target="_blank" rel="noopener noreferrer" class="rec-btn direction">${icons.route} <span data-i18n="directionsBtn">${t('directionsBtn')}</span></a>
              </div>`;
            }).join('');
            recsHtml = `<div class="info-row" style="margin-top: 0.5rem; align-items: flex-start;">
                 <span class="info-icon">${recIcon}</span>
                 <span class="info-value" style="flex:1;">
                   <span class="info-label">${recLabel}</span>
                   <div class="rec-list" style="margin-top: 0.4rem;">${recItemsHtml}</div>
                 </span>
               </div>`;
          } else if (typeof recs === 'string' && recs.trim() !== '') {
            // 문자열 폴백 (구버전 데이터 호환)
            recsHtml = `<div class="info-row" style="margin-top: 0.5rem; align-items: flex-start;">
                 <span class="info-icon">${isDining ? icons.dining : isCafe ? icons.cafe : icons.star}</span>
                 <span class="info-value">
                   <span class="info-label">${isDining ? '추천 식당 Top 3' : isCafe ? '추천 카페 Top 3' : '추천 Top 3'}</span>
                   <div style="margin-top: 0.3rem; white-space: pre-line; line-height: 1.7;">${escapeHtml(recs.trim())}</div>
                 </span>
               </div>`;
          }

          // 값이 없는 줄은 아예 그리지 않는다. "현지 팁: —" 은 정보가
          // 없다는 뜻이 아니라 앱이 부실하다는 인상만 남긴다.
          const infoLine = (icon, label, value, className = '') => {
            const text = typeof value === 'string' ? value.trim() : '';
            if (!text || text === '—') return '';
            return `
                <div class="info-row${className ? ` ${className}` : ''}">
                  <span class="info-icon">${icon}</span>
                  <span class="info-value"><span class="info-label">${label}</span> ${escapeHtml(text)}</span>
                </div>`;
          };

          // 현지 팁은 외국인 사용자에게 방문 여부를 가르는 정보다
          // (영어 메뉴 유무, 택스프리, 대기시간). 다른 메타 정보와 같은
          // 줄에 두지 않고 한 칸 올린다.
          const tipText = typeof info.localTip === 'string' ? info.localTip.trim() : '';
          const tipHtml = (!tipText || tipText === '—') ? '' : `
                <div class="info-row tip">
                  <span class="info-icon">${icons.tip}</span>
                  <span class="info-value"><span class="info-label">${t('localTipLabel') || '현지 팁'}</span>${escapeHtml(tipText)}</span>
                </div>`;

          const transportCost = isTransportEstimatedCost(info.estimatedCost, scheduleItem.type);
          const lines = [
            infoLine(
              icons.cost,
              transportCost ? (t('unverifiedTransitCostLabel') || 'AI 예상 교통비 · 확인 필요') : `${t('estimatedCostLabel') || '예상 비용'}`,
              info.estimatedCost,
              transportCost ? 'gemini-transport-cost' : ''
            ),
            infoLine(icons.hours, t('hoursUnverifiedText'), info.operatingHours),
          ].join('');

          if (!lines && !tipHtml && !recsHtml) return '';

          return details(`
            <div class="quick-info-box structured">
              <div class="info-group">${lines}${tipHtml}${recsHtml}
              </div>
            </div>
          `);
        }

        // Legacy String Format (Phase 3 Fallback)
        return details(`
          <div class="quick-info-box">
            <span class="quick-info-icon">${icons.tip}</span>
            <div class="quick-info-text">${escapeHtml(info)}</div>
          </div>
        `);
      })()}
      ${linksHtml}
    </div>
  `;
}
