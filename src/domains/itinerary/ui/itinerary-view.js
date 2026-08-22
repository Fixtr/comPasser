import { saveItinerary, createSharedItinerary, getItineraryById } from '../services/firestore-service.js';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { t, getLang } from '../../../utils/i18n.js';
import { trackEvent } from '../../../utils/analytics.js';

import { itineraryStyles } from './itinerary-style.js';
import { openNavPopup } from './nav-popup.js';
import { icons } from '../../../ui/icons.js';
import { normalizeData } from '../services/itinerary-normalize.mjs';
import { buildItineraryTitle } from '../services/itinerary-title.mjs';
import { summarizeCosts, formatCostSummary } from '../services/itinerary-cost.mjs';
import { removeScheduleItem, moveScheduleItem, insertScheduleItem, isEditableItem } from '../services/itinerary-edit.mjs';
import { showConfirm } from '../../../utils/confirm-dialog.js';
import { trimScheduleToEndTime } from '../services/itinerary-schedule-adjust.mjs';
import { describeResolvedPlace } from '../services/itinerary-resolved-place.mjs';
import {
  buildItineraryViewModel,
  reconcileWithConstraints,
  getEndTimeWarning,
  getTransitCoverage
} from '../services/itinerary-view-model.mjs';
import {
  getTransitStyle,
  getTransitModeText,
  renderTransitStep,
  renderTransitInfo
} from './itinerary-render-helpers.js';
import { showToast as showGlobalToast } from '../../../utils/toast.js';

/**
 * duration 이 없는 항목(사용자가 넣었거나 구버전 데이터)에 쓸 표시값.
 * 그냥 두면 화면에 "undefined" 가 그대로 노출된다.
 */
function fallbackDuration(item) {
  const toMinutes = (time) => {
    if (!/^\d{2}:\d{2}$/.test(time || '')) return null;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  const start = toMinutes(item?.time);
  const end = toMinutes(item?.endTime);
  if (start === null || end === null || end <= start) return '';

  const total = end - start;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}시간 ${mins}분`;
  if (hours) return `${hours}시간`;
  return `${mins}분`;
}

export default class ItineraryView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.currentItinerary = null;
    this.activeDayIndex = 0;
    // 지도가 실제 이동시간을 구했는지 추적한다. 실패를 조용히 넘기면 화면에는
    // AI 추정 시각이 검증된 것처럼 남는다.
    this.lastTransitRoutes = [];
    this.transitUnavailable = false;
  }

  connectedCallback() {
    this.render();
    
    this.setupSaveListener();
    this.setupShareListener();
    this.setupKakaoShareListener();
    this.setupDownloadListener();
    this.updateTexts();

    window.addEventListener('i18n-changed', () => {
      this.updateTexts();
    });

    // 지도(map-view)가 계산한 실제 대중교통 경로를 타임라인에 반영
    this._transitInfoHandler = (e) => {
      const transitRoutes = Array.isArray(e.detail) ? e.detail : [];
      this.lastTransitRoutes = transitRoutes;
      // 유효한 경로가 하나라도 오면 실패 상태를 푼다(지도가 재계산에 성공한 경우).
      if (transitRoutes.some(r => typeof r?.durationMinutes === 'number')) {
        this.transitUnavailable = false;
      }
      // Gemini가 추정한 시각은 실제 이동시간과 어긋날 수 있다(예: 이동에
      // 45분이 걸리는데 다음 항목이 이동시간 없이 바로 시작하는 것처럼
      // 생성되는 경우). 실제 이동시간이 밝혀졌으니 뒤 항목들의 시각을
      // 필요한 만큼만 보정한다.
      this.applyTransitDelaysToActiveDay(transitRoutes);
      this.renderTransitInfo(transitRoutes);
    };
    window.addEventListener('transit-info-ready', this._transitInfoHandler);

    // 지도가 실제 이동시간을 구하지 못했을 때(지오코딩/Directions 실패 등)
    this._transitUnavailableHandler = () => {
      this.transitUnavailable = true;
      this.refreshTransitNotice();
    };
    window.addEventListener('transit-unavailable', this._transitUnavailableHandler);

    // 지도가 실제로 찾은 장소를 화면에 반영한다(오매칭이 드러나도록).
    this._placesResolvedHandler = (e) => {
      this.applyResolvedPlaces(Array.isArray(e.detail) ? e.detail : []);
    };
    window.addEventListener('places-resolved', this._placesResolvedHandler);
  }

  disconnectedCallback() {
    window.removeEventListener('transit-info-ready', this._transitInfoHandler);
    window.removeEventListener('transit-unavailable', this._transitUnavailableHandler);
    window.removeEventListener('places-resolved', this._placesResolvedHandler);
    // 3. 컴포넌트 클린업: 유저가 다른 페이지로 이동 시 Light DOM 기반의 광고 컨테이너 제거
    const adWrapper = this.querySelector('.adsense-wrapper');
    if (adWrapper) {
      adWrapper.remove();
    }
  }

  updateTexts() {
    const elements = this.shadowRoot.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
        el.setAttribute('placeholder', t(key));
      } else {
        el.textContent = t(key);
      }
    });

    if (this.currentItinerary && this.currentItinerary.days && this.currentItinerary.days.length > 0) {
      const dayData = this.currentItinerary.days[0];
      const headerFormat = t('itineraryHeader') || '{0} 여행 일정';
      const headerEl = this.shadowRoot.getElementById('day-title-header');
      if (headerEl) {
        headerEl.textContent = headerFormat.replace('{0}', dayData.date);
      }
    }
  }

  setupSaveListener() {
    const saveBtn = this.shadowRoot.getElementById('save-itinerary-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        trackEvent('save_itinerary_click');
        const user = getCurrentUser();
        if (!user) {
          this.showToast("로그인이 필요합니다.", true);
          return;
        }
        if (!this.currentItinerary) return;

        try {
          saveBtn.disabled = true;
          saveBtn.textContent = t('savingStateBtn') || '저장 중...';
          const title = buildItineraryTitle(this.currentItinerary, getLang());
          const newId = await saveItinerary(user.uid, this.currentItinerary, title);
          this.showToast(t('itinerarySaveToast') || "일정이 성공적으로 저장되었습니다! 🎉");
          
          // 🚀 [Routing] URL 업데이트: /view/:id 로 이동
          if (window.navigate) {
            window.navigate('/view/' + newId);
          }
        } catch (error) {
          console.error("Save error:", error);
          this.showToast(t('saveFailToast') || "저장에 실패했습니다.", true);
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = t('saveItineraryBtn') || '이 일정 저장하기';
        }
      });
    }
  }

  async checkUrlForId() {
    const path = window.location.pathname;
    const match = path.match(/^\/view\/([a-zA-Z0-9]+)$/);
    if (match && match[1]) {
      const id = match[1];
      await this.loadItineraryById(id);
    }
  }

  normalizeData(rawData) {
    return normalizeData(rawData);
  }

  /**
   * 저장/공유로 읽어온 일정에도 확정적 가드레일을 다시 적용한다.
   * 실제 계산은 itinerary-view-model.mjs 가 담당한다(테스트 가능한 순수 모듈).
   */
  reconcileWithConstraints(rawData) {
    return reconcileWithConstraints(rawData, getLang());
  }

  async loadItineraryById(id) {
    try {
      this.clear();
      this.setLoading(true);
      
      const data = await getItineraryById(id);

      if (!data) {
        this.setError(`
          <div style="padding: 40px 20px; text-align: center; color: var(--text-secondary); background: var(--bg-secondary); border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: var(--shadow-sm);">
             <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
             <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem;">일정을 찾을 수 없거나 접근 권한이 없습니다.</h3>
             <p style="font-size: 0.9rem; margin-bottom: 2rem;">요청하신 여행 일정이 삭제되었거나, 비공개 상태일 수 있습니다.<br>올바른 링크인지 다시 확인해 주세요.</p>
             <button onclick="window.navigate('/plan')" style="background: var(--accent-primary); color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;">새 일정 만들기 🚀</button>
          </div>
        `);
        return;
      }

      this.showResults(data);

      // Dispatch event for map to update. showResults 가 가드레일을 재적용한
      // 결과(this.currentItinerary)를 쓴다 — 원본을 그대로 넘기면 지도만
      // 보정 전 항목(가짜 "OO로 이동" 등)을 그리게 된다.
      const safePlan = this.normalizeData(this.currentItinerary || data);
      if (safePlan) {
        window.dispatchEvent(new CustomEvent('render-map-route', { detail: safePlan }));
      }
    } catch (error) {
      console.error('🔥 렌더링 치명적 오류:', error);
      this.setError(`
        <div style="padding: 40px 20px; text-align: center; color: #b91c1c; background: #fef2f2; border-radius: 12px; border: 2px solid #fca5a5;">
           <div style="font-size: 3rem; margin-bottom: 1rem;">🚨</div>
           <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">데이터 로딩 오류</h3>
           <p style="font-size: 0.9rem;">${error.message}</p>
        </div>
      `);
    } finally {
      this.setLoading(false);
    }
  }

  setupShareListener() {
    const shareBtn = this.shadowRoot.getElementById('share-itinerary-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        if (!this.currentItinerary) return;

        const originalText = shareBtn.textContent;
        try {
          shareBtn.textContent = "링크 생성 중...";
          shareBtn.disabled = true;

          const docId = await createSharedItinerary(this.currentItinerary);
          const shareUrl = window.location.origin + '/view/' + docId;

          await navigator.clipboard.writeText(shareUrl);
          showGlobalToast(t('shareSuccessAlert') || "공유 링크가 클립보드에 복사되었습니다!", { tone: 'success' });
        } catch (error) {
          console.error("Share error:", error);
          this.showToast("링크 생성 중 오류가 발생했습니다.", true);
        } finally {
          shareBtn.textContent = originalText;
          shareBtn.disabled = false;
        }
      });
    }
  }

  setupKakaoShareListener() {
    const kakaoBtn = this.shadowRoot.getElementById('kakao-share-btn');
    if (kakaoBtn) {
      kakaoBtn.addEventListener('click', async () => {
        trackEvent('share_kakao_click');
        if (!this.currentItinerary) return;

        const originalText = kakaoBtn.textContent;
        try {
          kakaoBtn.textContent = "링크 생성 중...";
          kakaoBtn.disabled = true;

          const docId = await createSharedItinerary(this.currentItinerary);
          const shareUrl = window.location.origin + '/view/' + docId;

          Kakao.Share.sendDefault({
            objectType: 'feed',
            content: {
              title: "✈️ 나만의 스마트한 여행 일정이 도착했어요!",
              description: "ComPasser에서 만든 완벽한 여행 타임라인과 지도를 지금 바로 확인해 보세요.",
              imageUrl: "https://images.unsplash.com/photo-1488646953014-c8c2eb5f2b2b",
              link: {
                mobileWebUrl: shareUrl,
                webUrl: shareUrl,
              },
            },
            buttons: [
              {
                title: "일정 자세히 보기",
                link: {
                  mobileWebUrl: shareUrl,
                  webUrl: shareUrl,
                },
              },
            ],
          });
        } catch (error) {
          console.error("Kakao Share error:", error);
          this.showToast("카카오톡 공유 중 오류가 발생했습니다.", true);
        } finally {
          kakaoBtn.textContent = originalText;
          kakaoBtn.disabled = false;
        }
      });
    }
  }

  setupDownloadListener() {
    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadAsImage());
    }
  }

  async downloadAsImage() {
    if (!this.currentItinerary) return;
    
    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    const originalText = downloadBtn ? downloadBtn.textContent : '';
    
    // 1. 임시 컬러 조작을 위한 변수
    const styleTag = this.shadowRoot.querySelector('style');
    let originalStyleContent = '';
    
    try {
      if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.textContent = "이미지 생성 중...";
      }
      
      // 2. html2canvas 파싱 에러(color-mix 등 최신 CSS 함수) 우회를 위해 안전한 색상으로 치환
      if (styleTag) {
        originalStyleContent = styleTag.textContent;
        // 문제가 되는 color-mix 등 최신 문법을 정적 색상으로 임시 변경
        styleTag.textContent = styleTag.textContent
          .replace(/color-mix\([^;}]+\)/g, 'rgba(124, 58, 237, 0.15)')
          .replace(/color\([^;}]+\)/g, 'rgba(124, 58, 237, 0.15)');
      }
      
      const target = this.shadowRoot.getElementById('results-content');
      
      // html2canvas options
      const options = {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        // 3. 버튼 등 불필요한 요소 캡처 제외
        ignoreElements: (element) => {
          if (element.tagName === 'BUTTON') return true;
          if (element.classList && element.classList.contains('itinerary-actions')) return true;
          if (element.id && (element.id.includes('-btn') || element.id === 'itinerary-actions')) return true;
          return false;
        },
        onclone: (clonedDoc) => {
          const clonedResults = clonedDoc.querySelector('#results-content');
          if (clonedResults) {
            clonedResults.style.padding = '40px';
            clonedResults.style.borderRadius = '0';
            clonedResults.style.background = '#ffffff';

            // Ensure specific standard colors for capture
            const overrideStyle = clonedDoc.createElement('style');
            overrideStyle.textContent = `
              .timeline::before { background: #e5e7eb !important; }
              .schedule-card { border-color: #e5e7eb !important; background: #ffffff !important; color: #1f2937 !important; }
              .schedule-card[data-type="AnchorSchedule"] { border-color: #7c3aed !important; background: #f5f3ff !important; }
              .time-badge { color: #7c3aed !important; }
              .schedule-title { color: #1f2937 !important; }
              .schedule-desc { color: #4b5563 !important; }
              .schedule-meta { color: #6b7280 !important; }
              .transit-pill { background: #f3f4f6 !important; border-color: #e5e7eb !important; color: #4b5563 !important; }
              h2 { color: #1f2937 !important; border-bottom: 2px solid #f3f4f6 !important; margin-bottom: 20px !important; }
            `;
            clonedResults.appendChild(overrideStyle);
          }
        }
      };
      
      const canvas = await html2canvas(target, options);
      const dataUrl = canvas.toDataURL("image/png");
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `my-trip-itinerary-${new Date().getTime()}.png`;
      link.click();
      
      this.showToast("이미지를 저장했습니다.");
    } catch (error) {
      // 4. 에러 핸들링 보강
      console.error("[html2canvas] Image generation failed:", error);
      this.showToast("최신 브라우저 환경에서 캡처 기능이 지원되지 않을 수 있습니다.", true);
    } finally {
      // 5. Cleanup: CSS 원상복구
      if (styleTag && originalStyleContent) {
        styleTag.textContent = originalStyleContent;
      }
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = originalText;
      }
    }
  }

  /**
   * 컴포넌트 안에 따로 두던 토스트를 앱 공용 토스트로 위임한다.
   * Shadow DOM 안에 있으면 이 컴포넌트가 화면에 없을 때 알림을 띄울 수 없고,
   * 다른 화면의 알림과 위치·모양이 제각각이 된다.
   */
  showToast(message, isError = false) {
    showGlobalToast(message, { tone: isError ? 'error' : 'success' });
  }

  // ========== 이동 수단 시각화 (업그레이드) ==========
  getTransitStyle(mode, vehicleType) {
    return getTransitStyle(mode, vehicleType);
  }

  getTransitModeText(vehicleType, lineName) {
    return getTransitModeText(vehicleType, lineName);
  }

  renderTransitStep(step) {
    return renderTransitStep(step);
  }

  renderTransitInfo(transitRoutes) {
    renderTransitInfo(this.shadowRoot, transitRoutes);
  }

  /**
   * 실제 이동시간(transitRoutes)을 반영해 현재 보고 있는 날짜의
   * scheduleItems 시각을 보정하고, 이미 그려진 타임라인의 시간 배지만
   * 갱신한다(전체 재렌더 대신 — renderActiveDay는 페이드 애니메이션 때문에
   * DOM 반영이 150ms 지연되어 뒤이은 renderTransitInfo와 타이밍이 꼬인다).
   * currentItinerary 자체를 갱신하므로, 이후 "저장하기"를 눌러도 보정된
   * 시각이 저장된다.
   */
  /**
   * 현재 보고 있는 날짜 기준으로 종료 시각 초과 여부를 다시 계산해 경고를
   * 갱신한다. 이동시간 보정 직후뿐 아니라 날짜 탭을 바꿀 때도 불러야 한다 —
   * 그러지 않으면 1일차에서 뜬 경고가 2일차 화면에 그대로 남는다.
   *
   * 종료 시각은 generateOptimizedItinerary()가 반환한 { request, days } 형태에
   * 그대로 남아있어, 저장된 일정을 불러온 경우에도 읽을 수 있다.
   */
  refreshEndTimeWarning() {
    // currentItinerary 에는 이미 이동시간 보정이 반영돼 있다. buildItineraryViewModel
    // 을 쓰면 reconcile 이 다시 돌아 초과분이 정규화돼 사라지므로, 현재 상태만
    // 보고 판단하는 getEndTimeWarning 을 쓴다.
    const { overflowMinutes, endTime } = getEndTimeWarning(this.currentItinerary, this.activeDayIndex);
    this.renderEndTimeWarning(overflowMinutes, endTime);
  }

  /**
   * AI 일정 생성이 실패해 임시(Mock) 일정이 표시되고 있음을 알린다.
   *
   * 예전에는 alert 한 번만 띄우고 임시 일정을 정상 결과와 똑같이 보여줬다.
   * alert 을 닫으면 화면에는 "출발 -> 도착"만 있는 가짜 일정이 남고, 사용자가
   * 그걸 진짜로 믿고 저장·공유까지 할 수 있었다. 임시 일정임을 상시 표시하고
   * 저장/공유 버튼은 숨겨 잘못된 일정이 퍼지지 않게 한다.
   *
   * @returns {boolean} 임시 일정이면 true
   */
  refreshFallbackWarning() {
    const box = this.shadowRoot.getElementById('fallback-warning');
    const isFallback = Boolean(this.currentItinerary?.isFallback);
    if (!box) return isFallback;

    if (!isFallback) {
      box.style.display = 'none';
      box.textContent = '';
      return false;
    }

    const reason = this.currentItinerary?.fallbackReason === 'quota'
      ? (t('fallbackReasonQuota') || 'AI 일일 사용량을 모두 소진했습니다.')
      : (t('fallbackReasonError') || 'AI 일정 생성에 실패했습니다.');

    box.textContent = `🚨 ${reason} ${t('fallbackNotice') || '아래는 출발지와 도착지만 채운 임시 일정이며 실제 추천이 아닙니다. 잠시 후 다시 시도해 주세요.'}`;
    box.style.display = 'block';
    return true;
  }

  /**
   * 지도가 해석한 장소 이름/주소를 카드에 반영한다.
   *
   * 카드에는 AI 가 쓴 문자열("서울 경복궁")이 떠 있는데, 지도가 실제로 찾은
   * 곳과 다를 수 있다. 실제로 찾은 이름이 다르면 함께 보여줘서 오매칭이
   * 눈에 띄게 한다. 같으면 굳이 덧붙이지 않는다.
   */
  applyResolvedPlaces(resolved) {
    if (!Array.isArray(resolved) || resolved.length === 0) return;

    const plan = this.normalizeData(this.currentItinerary);
    const items = plan?.days?.[this.activeDayIndex]?.scheduleItems;
    if (!Array.isArray(items)) return;

    const cards = this.shadowRoot.querySelectorAll('#timeline-container .schedule-card');

    resolved.forEach(({ index, name, address }) => {
      const item = items[index];
      const card = cards[index];
      if (!item || !card) return;

      // 저장/공유에도 남도록 항목에도 기록해 둔다.
      item.resolvedName = name;
      item.resolvedAddress = address;

      const target = card.querySelector('.resolved-place');
      if (!target) return;

      const { visible, mismatch, detail } = describeResolvedPlace({
        written: item.location,
        name,
        address,
      });

      if (!visible) {
        target.style.display = 'none';
        return;
      }

      target.textContent = `${icons.search} ${t('resolvedPlaceLabel') || '지도에서 찾은 곳'}: ${detail}`;
      target.style.display = 'block';
      // 적어둔 이름과 다르면 눈에 띄게 표시한다.
      target.classList.toggle('mismatch', mismatch);
    });
  }

  /**
   * "여기에 장소 추가" 자리를 만든다. 누르면 그 자리에서 입력 폼으로 바뀐다.
   */
  buildInsertSlot(insertAt) {
    const slot = document.createElement('div');
    slot.className = 'insert-slot';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'insert-slot-btn';
    btn.textContent = t('addStopHere') || '+ 여기에 장소 추가';
    btn.setAttribute('aria-label', t('addStopHere') || '여기에 장소 추가');
    btn.addEventListener('click', () => this.openInsertForm(slot, insertAt));

    slot.appendChild(btn);
    return slot;
  }

  /**
   * 삽입 자리를 입력 폼으로 바꾼다.
   *
   * 장소는 폼과 같은 Google 자동완성을 쓰고 싶지만, 이 컴포넌트는 Shadow DOM
   * 안이라 gmp-place-autocomplete 를 새로 붙이면 초기화 타이밍이 얽힌다.
   * 지금은 이름만 받고 지오코딩은 지도가 하도록 맡긴다 — 사용자가 적은
   * 이름 그대로 지도가 좌표를 찾고, 못 찾으면 이미 있는 "이동시간 미확인"
   * 안내가 그 사실을 알려 준다.
   */
  openInsertForm(slot, insertAt) {
    if (slot.dataset.editing === 'true') return;
    slot.dataset.editing = 'true';
    const original = slot.innerHTML;

    slot.innerHTML = `
      <div class="insert-form">
        <input class="insert-input" type="text" maxlength="60"
               placeholder="${t('addStopPlaceholder') || '장소 이름 (예: 남산서울타워)'}"
               aria-label="${t('addStopPlaceholder') || '추가할 장소 이름'}">
        <label class="insert-stay">
          <span>${t('addStopStay') || '체류'}</span>
          <select class="insert-stay-select" aria-label="${t('addStopStay') || '체류 시간'}">
            <option value="30">30분</option>
            <option value="60" selected>1시간</option>
            <option value="90">1시간 30분</option>
            <option value="120">2시간</option>
          </select>
        </label>
        <button type="button" class="insert-confirm">${t('addStopConfirm') || '추가'}</button>
        <button type="button" class="insert-cancel">${t('cancelBtn') || '취소'}</button>
      </div>
    `;

    const input = slot.querySelector('.insert-input');
    input.focus();

    const restore = () => {
      slot.innerHTML = original;
      slot.dataset.editing = 'false';
      slot.querySelector('.insert-slot-btn')
        ?.addEventListener('click', () => this.openInsertForm(slot, insertAt));
    };

    const commit = () => {
      const name = input.value.trim();
      if (!name) {
        showGlobalToast(t('addStopEmpty') || '장소 이름을 입력해 주세요.', { tone: 'warning' });
        input.focus();
        return;
      }
      const stayMinutes = Number(slot.querySelector('.insert-stay-select').value) || 60;
      this.insertPlaceAt(insertAt, { title: name, location: name, stayMinutes });
    };

    slot.querySelector('.insert-confirm').addEventListener('click', commit);
    slot.querySelector('.insert-cancel').addEventListener('click', restore);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); restore(); }
    });
  }

  /**
   * 사용자가 고른 자리에 장소를 넣고 화면·지도를 다시 그린다.
   */
  insertPlaceAt(insertAt, place) {
    const plan = this.normalizeData(this.currentItinerary);
    const dayData = plan?.days?.[this.activeDayIndex];
    if (!dayData || !Array.isArray(dayData.scheduleItems)) return;

    const { items, inserted } = insertScheduleItem(dayData.scheduleItems, insertAt, place);
    if (!inserted) {
      showGlobalToast(t('addStopFailed') || '이 위치에는 장소를 추가할 수 없습니다.', { tone: 'warning' });
      return;
    }

    dayData.scheduleItems = items;
    this.renderActiveDay(plan);
    showGlobalToast(`"${inserted.title}"을 일정에 추가했습니다.`, { tone: 'success' });

    // 새 장소의 좌표와 실제 이동시간을 지도가 다시 계산하게 한다.
    window.dispatchEvent(new CustomEvent('render-map-route', {
      detail: { ...plan, days: [dayData] }
    }));
  }

  /**
   * 타임라인 항목을 옮기거나 뺀다.
   *
   * 계산은 itinerary-edit.mjs 가 하고 여기서는 결과를 반영해 다시 그린다.
   * 편집 결과는 currentItinerary 에 남으므로 이어서 저장/공유해도 그대로다.
   * 삭제는 되돌릴 수 없으니 확인을 받는다.
   */
  async handleItemEdit(action, index) {
    const plan = this.normalizeData(this.currentItinerary);
    const dayData = plan?.days?.[this.activeDayIndex];
    if (!dayData || !Array.isArray(dayData.scheduleItems)) return;

    if (action === 'remove') {
      const target = dayData.scheduleItems[index];
      const ok = await showConfirm({
        title: '일정에서 빼기',
        message: `"${target?.title || '이 항목'}"을 일정에서 뺄까요? 뒤 일정의 시각이 앞으로 당겨집니다.`,
        confirmText: '빼기'
      });
      if (!ok) return;

      const { items, removed } = removeScheduleItem(dayData.scheduleItems, index);
      if (!removed) return;
      dayData.scheduleItems = items;
      showGlobalToast(`"${removed.title}"을 일정에서 뺐습니다.`, { tone: 'success' });
    } else {
      const { items, moved } = moveScheduleItem(dayData.scheduleItems, index, action === 'up' ? -1 : 1);
      if (!moved) {
        showGlobalToast('더 옮길 수 없습니다.', { tone: 'warning' });
        return;
      }
      dayData.scheduleItems = items;
    }

    this.renderActiveDay(plan);
    // 지도와 이동시간을 새 순서로 다시 계산하게 한다.
    window.dispatchEvent(new CustomEvent('render-map-route', {
      detail: { ...plan, days: [dayData] }
    }));
  }

  /**
   * 종료 시각을 넘긴 일정을 실제로 줄여서 맞춘다.
   *
   * 표시 시각을 눌러 속이는 게 아니라 체류 시간을 깎거나 항목을 빼는 것이라,
   * 줄인 뒤에도 화면의 시각은 계속 사실이다. 무엇을 줄였는지 토스트로 알린다.
   */
  trimActiveDayToEndTime() {
    const plan = this.normalizeData(this.currentItinerary);
    const dayData = plan?.days?.[this.activeDayIndex];
    if (!dayData || !Array.isArray(dayData.scheduleItems)) return;

    const { endTime } = getEndTimeWarning(this.currentItinerary, this.activeDayIndex);
    if (!endTime) return;

    const { items, removedTitles, shortenedCount, resolved } =
      trimScheduleToEndTime(dayData.scheduleItems, endTime);

    if (removedTitles.length === 0 && shortenedCount === 0) {
      showGlobalToast(t('trimNothingToDo') || '더 줄일 수 있는 일정이 없습니다.', { tone: 'warning' });
      return;
    }

    dayData.scheduleItems = items;
    this.renderActiveDay(plan);

    const parts = [];
    if (shortenedCount > 0) parts.push(`${shortenedCount}곳 체류 시간 단축`);
    if (removedTitles.length > 0) parts.push(`${removedTitles.length}곳 제외(${removedTitles.join(', ')})`);
    const summary = parts.join(' · ');

    showGlobalToast(
      resolved ? `일정을 종료 시각에 맞췄습니다 — ${summary}` : `${summary} — 그래도 종료 시각을 넘습니다`,
      { tone: resolved ? 'success' : 'warning', duration: 5000 }
    );
  }

  /**
   * 지금 보고 있는 날짜의 1인 예상 비용을 합산해 보여준다.
   *
   * estimatedCost 는 자유 문자열이라 일부는 금액을 읽어낼 수 없다. 합계만
   * 보여주면 실제보다 적은 금액을 확정된 것처럼 알리게 되므로, 못 읽은
   * 항목 수를 함께 표시한다.
   */
  refreshCostSummary() {
    const box = this.shadowRoot.getElementById('cost-summary');
    if (!box) return;

    const plan = this.normalizeData(this.currentItinerary);
    const items = plan?.days?.[this.activeDayIndex]?.scheduleItems;
    const text = formatCostSummary(summarizeCosts(items), getLang());

    if (!text) {
      box.style.display = 'none';
      box.textContent = '';
      return;
    }
    box.innerHTML = `${icons.cost}<span>${text}</span>`;
    box.style.display = 'flex';
  }

  /**
   * 표시된 시각이 실제 이동시간으로 검증된 것인지 안내한다.
   *
   * 지도가 실패하면 예전에는 아무 표시 없이 AI 추정 시각만 남아, 사용자는
   * 그 시각이 검증된 줄 알았다. 검증되지 않았다는 사실 자체를 알려준다.
   */
  refreshTransitNotice() {
    const box = this.shadowRoot.getElementById('transit-notice');
    if (!box) return;

    const plan = this.normalizeData(this.currentItinerary);
    const items = plan?.days?.[this.activeDayIndex]?.scheduleItems;
    if (!Array.isArray(items) || items.length === 0) {
      box.style.display = 'none';
      return;
    }

    const { expected, resolved, status } = getTransitCoverage(
      items, this.lastTransitRoutes, this.transitUnavailable
    );

    if (status === 'verified') {
      box.style.display = 'none';
      box.textContent = '';
      return;
    }

    const noticeText = status === 'none'
      ? '실제 대중교통 소요시간을 확인하지 못했습니다. 아래 시각은 AI 추정치이며 실제와 다를 수 있습니다.'
      : `전체 ${expected}개 구간 중 ${resolved}개만 실제 소요시간이 확인됐습니다. 나머지 구간의 시각은 AI 추정치입니다.`;
    box.innerHTML = `${icons.info}<span></span>`;
    box.querySelector('span').textContent = noticeText;
    // 인라인 display 가 CSS 를 이기므로 여기서 flex 로 켠다(아이콘 정렬·간격).
    box.style.display = 'flex';
  }

  /**
   * 실제 이동시간을 반영한 결과 도착이 사용자가 지정한 종료 시각을 넘겼을 때
   * 띄우는 경고. 시각 자체는 사실대로 두고, 얼마나 초과했는지만 알려서
   * 사용자가 직접 일정을 조정할 수 있게 한다.
   */
  renderEndTimeWarning(overflowMinutes, dayEndTime) {
    const box = this.shadowRoot.getElementById('end-time-warning');
    if (!box) return;

    if (!overflowMinutes || overflowMinutes <= 0) {
      box.style.display = 'none';
      box.textContent = '';
      return;
    }

    const hours = Math.floor(overflowMinutes / 60);
    const mins = overflowMinutes % 60;
    const amount = hours > 0
      ? (mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`)
      : `${mins}분`;

    // 경고만 띄우면 사용자가 직접 폼으로 돌아가 다시 만들어야 한다.
    // 그 자리에서 해결할 수 있는 버튼을 함께 준다.
    box.innerHTML = '';
    const text = document.createElement('span');
    text.innerHTML = icons.warn;
    text.appendChild(document.createTextNode(` 실제 이동시간을 반영하면 종료 예정 시각(${dayEndTime})보다 약 ${amount} 늦게 끝납니다.`));
    box.appendChild(text);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'end-time-fix-btn';
    action.textContent = t('trimScheduleBtn') || '마지막 일정 줄여서 맞추기';
    action.addEventListener('click', () => this.trimActiveDayToEndTime());
    box.appendChild(action);

    box.style.display = 'block';
  }

  applyTransitDelaysToActiveDay(transitRoutes) {
    if (!this.currentItinerary) return;

    const { scheduleItems } = buildItineraryViewModel({
      rawItinerary: this.currentItinerary,
      activeDayIndex: this.activeDayIndex,
      transitRoutes,
      language: getLang()
    });
    if (!scheduleItems.length) return;

    // 보정 결과를 currentItinerary 에 반영해 저장/공유에도 그대로 담기게 한다.
    const plan = this.normalizeData(this.currentItinerary);
    const dayData = plan?.days?.[this.activeDayIndex];
    if (!dayData) return;
    dayData.scheduleItems = scheduleItems;

    this.refreshEndTimeWarning();
    this.refreshTransitNotice();
    this.refreshCostSummary();

    const badges = this.shadowRoot.querySelectorAll('#timeline-container .time-badge');
    scheduleItems.forEach((item, idx) => {
      const badge = badges[idx];
      if (!badge) return;
      badge.innerHTML = item.endTime ? `${item.time} -<br>${item.endTime}` : item.time;
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        ${itineraryStyles}
      </style>
      
      <!-- Global loader handles loading state -->

      <div id="results" style="display: none;">
        <!-- 배경은 호스트(:host)가 준다. 여기에 흰색을 박아 두면 다크 모드에서
             흰 띠가 생긴다. 캡처용 배경은 share 경로가 따로 지정한다. -->
        <div id="results-content">
          <div id="fallback-warning" class="fallback-warning" role="alert" style="display: none;"></div>
          <div id="transit-notice" class="transit-notice" role="status" aria-live="polite" style="display: none;"></div>
          <div id="end-time-warning" class="end-time-warning" role="status" aria-live="polite" style="display: none;"></div>
          <div id="cost-summary" class="cost-summary" style="display: none;"></div>
          <h2 id="day-title-header" style="padding-top: 0.5rem; margin-top: 0; display: none;"></h2>
          <div id="day-tabs-container" class="day-tabs-container" style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem; margin-bottom: 1rem; border-bottom: 2px solid #f3f4f6;">
            <!-- Tabs injected dynamically -->
          </div>
          <div class="timeline" id="timeline-container" style="transition: opacity 0.3s ease-in-out;">
            <!-- Dynamically injected -->
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 2rem;">
          <button id="download-image-btn" class="download-btn">일정 이미지로 저장하기</button>
          <button id="save-itinerary-btn" class="save-btn" data-i18n="saveItineraryBtn" style="margin-top: 0;">이 일정 저장하기</button>
          <button id="share-itinerary-btn" class="share-btn" data-i18n="shareItineraryBtn">일정 공유하기</button>
          <button id="kakao-share-btn" class="kakao-share-btn" data-i18n="kakaoShareBtn">💬 카카오톡 공유하기</button>
        </div>
      </div>

    `;
  }

  setLoading(isLoading) {
    this.setAttribute('visible', '');
    const results = this.shadowRoot.getElementById('results');

    if (isLoading) {
      results.style.display = 'none';
    } else {
      results.style.display = 'block';
    }
  }

  setError(msg) {
    this.setLoading(false);
    const container = this.shadowRoot.getElementById('timeline-container');
    container.innerHTML = `<p style="color: red;">${msg}</p>`;
  }

  clear() {
    this.currentItinerary = null;
    const container = this.shadowRoot.getElementById('timeline-container');
    if (container) container.innerHTML = '';
    const saveBtn = this.shadowRoot.getElementById('save-itinerary-btn');
    if (saveBtn) saveBtn.style.display = 'none';
    const shareBtn = this.shadowRoot.getElementById('share-itinerary-btn');
    if (shareBtn) shareBtn.style.display = 'none';
    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    if (downloadBtn) downloadBtn.style.display = 'none';
    const kakaoBtn = this.shadowRoot.getElementById('kakao-share-btn');
    if (kakaoBtn) kakaoBtn.style.display = 'none';
    this.renderEndTimeWarning(0);
    this.lastTransitRoutes = [];
    this.transitUnavailable = false;
    const notice = this.shadowRoot.getElementById('transit-notice');
    if (notice) notice.style.display = 'none';
    const fallback = this.shadowRoot.getElementById('fallback-warning');
    if (fallback) fallback.style.display = 'none';
    const cost = this.shadowRoot.getElementById('cost-summary');
    if (cost) cost.style.display = 'none';
  }

  showResults(itineraryData) {
    try {
      // 저장/공유로 불러온 일정도 최신 가드레일을 통과시킨 뒤 화면·저장·
      // 지도에 쓰이도록, 보정된 결과를 currentItinerary 로 삼는다.
      const reconciled = this.reconcileWithConstraints(itineraryData);
      this.currentItinerary = reconciled;
      this.setLoading(false);

      const safePlan = this.normalizeData(reconciled);

      if (!safePlan || !Array.isArray(safePlan.days) || safePlan.days.length === 0) {
        this.setError("<div>저장된 세부 일정이 없습니다.</div>");
        return;
      }

      // 새 일정은 항상 1일차부터: 지도(renderRoute)도 days[0]을 그리므로 둘을 일치시킨다
      this.activeDayIndex = 0;

    // 임시(Mock) 일정은 저장·공유를 막는다. 가짜 일정이 Firestore 에 남거나
    // 공유 링크로 퍼지면 되돌릴 방법이 없다.
    const isFallback = this.refreshFallbackWarning();

    const saveBtn = this.shadowRoot.getElementById('save-itinerary-btn');
    if (saveBtn) saveBtn.style.display = isFallback ? 'none' : 'block';

    const shareBtn = this.shadowRoot.getElementById('share-itinerary-btn');
    if (shareBtn) shareBtn.style.display = isFallback ? 'none' : 'block';

    const kakaoBtn = this.shadowRoot.getElementById('kakao-share-btn');
    if (kakaoBtn) kakaoBtn.style.display = isFallback ? 'none' : 'block';

    const downloadBtn = this.shadowRoot.getElementById('download-image-btn');
    if (downloadBtn) downloadBtn.style.display = 'block';

    // Tabs setup
    const tabsContainer = this.shadowRoot.getElementById('day-tabs-container');
    tabsContainer.innerHTML = '';
    
    if (safePlan.days.length > 1) {
      tabsContainer.style.display = 'flex';
      safePlan.days.forEach((dayData, idx) => {
        const tabBtn = document.createElement('button');
        tabBtn.className = `day-tab-btn ${idx === this.activeDayIndex ? 'active' : ''}`;
        
        // Use i18n formatter
        const dayLabelTemplate = t('day_n') || '{0}일차';
        const dayNum = dayData.day || idx + 1;
        const dayLabel = dayLabelTemplate.replace('{0}', dayNum);
        
        tabBtn.innerHTML = `<strong>${dayLabel}</strong><br><span style="font-size: 0.75rem; font-weight: normal; opacity: 0.8;">${dayData.date}</span>`;
        tabBtn.style.padding = '0.5rem 1rem';
        tabBtn.style.border = 'none';
        tabBtn.style.background = idx === this.activeDayIndex ? 'var(--accent-primary, #7c3aed)' : '#f3f4f6';
        tabBtn.style.color = idx === this.activeDayIndex ? 'white' : '#4b5563';
        tabBtn.style.borderRadius = '8px';
        tabBtn.style.cursor = 'pointer';
        tabBtn.style.flexShrink = '0';
        tabBtn.style.transition = 'all 0.2s';
        
        tabBtn.addEventListener('click', () => {
          this.activeDayIndex = idx;
          this.renderActiveDay(safePlan);
          
          // Dispatch map update for specific day
          const singleDayPlan = { ...safePlan, days: [safePlan.days[idx]] };
          window.dispatchEvent(new CustomEvent('render-map-route', { detail: singleDayPlan }));
        });
        
        tabsContainer.appendChild(tabBtn);
      });
    } else {
      tabsContainer.style.display = 'none';
      const headerFormat = t('itineraryHeader') || '{0} 여행 일정';
      const headerEl = this.shadowRoot.getElementById('day-title-header');
      if (headerEl) {
        headerEl.textContent = headerFormat.replace('{0}', safePlan.days[0]?.date || '');
        headerEl.style.display = 'block';
      }
    }

    // Render initial
    this.renderActiveDay(safePlan);
    this.renderAds();
    } catch (error) {
      console.error('showResults error:', error);
    }
  }

  renderActiveDay(safePlan) {
    const container = this.shadowRoot.getElementById('timeline-container');
    if (!container) return;

    // 날짜를 바꾸면 경고/안내/비용도 그 날짜 기준으로 다시 계산해야 한다.
    this.refreshEndTimeWarning();
    this.refreshTransitNotice();
    this.refreshCostSummary();
    
    // Update Tabs UI
    const tabsContainer = this.shadowRoot.getElementById('day-tabs-container');
    const tabs = tabsContainer.querySelectorAll('.day-tab-btn');
    tabs.forEach((tab, idx) => {
      tab.style.background = idx === this.activeDayIndex ? 'var(--accent-primary, #7c3aed)' : '#f3f4f6';
      tab.style.color = idx === this.activeDayIndex ? 'white' : '#4b5563';
    });

    // Fade Out
    container.style.opacity = '0';
    
    setTimeout(() => {
      container.innerHTML = ''; // Clear old
      
      const dayData = safePlan.days[this.activeDayIndex];
      if (!dayData) {
        container.style.opacity = '1';
        return;
      }

      let globalIdx = 0;
      const items = dayData.scheduleItems || [];
      
      // 최후의 방어벽: 구버전 데이터 파손으로 인해 scheduleItems가 없을 때
      if (items.length === 0) {
        const fallbackItem = document.createElement('div');
        fallbackItem.className = 'timeline-item';
        fallbackItem.innerHTML = `
          <div class="time-badge">--:--</div>
          <div class="schedule-card" style="border-color: var(--cp-danger); border-left-color: var(--cp-danger); background: var(--cp-danger-bg);">
            <div class="schedule-title" style="color: var(--cp-danger);">항목 없음</div>
            <div class="schedule-desc" style="color: var(--cp-danger);">저장된 세부 일정이 없습니다.</div>
          </div>
        `;
        container.appendChild(fallbackItem);
        return;
      }

      items.forEach((scheduleItem) => {
        const idx = globalIdx++;
      const item = document.createElement('div');
      item.className = 'timeline-item';

      const timeDisplay = scheduleItem.endTime ? `${scheduleItem.time} -<br>${scheduleItem.endTime}` : scheduleItem.time;

      // location이 객체(좌표)일 수 있으므로 안전하게 문자열 변환
      const locationStr = typeof scheduleItem.location === 'string'
        ? scheduleItem.location
        : (scheduleItem.location ? JSON.stringify(scheduleItem.location) : '');
      const gmapsStr = typeof scheduleItem.googleMapsUrl === 'string' ? scheduleItem.googleMapsUrl : '';

      // 출발/도착은 사용자가 폼에서 지정한 경계라 편집 대상이 아니다.
      const editHtml = isEditableItem(scheduleItem) ? `
        <div class="item-edit-actions">
          <button class="item-edit-btn" data-edit="up" data-idx="${idx}" aria-label="${scheduleItem.title} 앞으로 옮기기" title="앞으로">↑</button>
          <button class="item-edit-btn" data-edit="down" data-idx="${idx}" aria-label="${scheduleItem.title} 뒤로 옮기기" title="뒤로">↓</button>
          <button class="item-edit-btn danger" data-edit="remove" data-idx="${idx}" aria-label="${scheduleItem.title} 일정에서 빼기" title="빼기">✕</button>
        </div>
      ` : '';

      const linksHtml = `
        <div class="action-links">
          ${scheduleItem?.officialWebsiteUrl ? `<a href="${scheduleItem.officialWebsiteUrl}" target="_blank" rel="noopener noreferrer" class="action-link-badge">${icons.info} 홈페이지</a>` : ''}
          ${gmapsStr ? `<a href="${gmapsStr}" target="_blank" rel="noopener noreferrer" class="action-link-badge primary">${icons.search} 리뷰 보기</a>` : ''}
          <button class="nav-btn" data-location="${locationStr.replace(/"/g, '&quot;')}" data-gmaps="${gmapsStr.replace(/"/g, '&quot;')}">${icons.route} 길찾기</button>
        </div>
      `;

      item.innerHTML = `
        <div class="time-badge">${timeDisplay}</div>
        <div class="schedule-card" data-type="${scheduleItem.type}" data-index="${idx + 1}"${scheduleItem.addedByUser ? ' data-added="true"' : ''}>
          <div class="schedule-title-row">
            <span class="schedule-title">${scheduleItem.title}</span>
            ${editHtml}
          </div>
          ${(function() {
            const info = scheduleItem.transitInfo;
            if (!info) return '';
            
            const trimmedInfo = info.trim();
            // 강화된 필터링 키워드
            const skipKeywords = ['없음', '이동 완료', '정보 없음', 'null', 'undefined'];
            if (trimmedInfo === '' || skipKeywords.some(k => trimmedInfo.includes(k))) return '';
            
            // 색은 지도 마커 규칙에만 쓴다(보라=고정, 초록=첫 장소, 파랑=나머지).
            // 이동 안내가 초록을 쓰면 같은 초록이 두 가지를 뜻하게 된다.
            return `<div class="schedule-desc gemini-transit">${icons.route}<span>${t('transitGuideLabel') || '이동 안내'} · ${trimmedInfo}</span></div>`;
          })()}
          <div class="resolved-place" style="display: none;"></div>
          <div class="schedule-meta">
            <span class="meta-item">${icons.pin} ${locationStr}</span>
            <span class="meta-item">${icons.clock} ${scheduleItem.duration || fallbackDuration(scheduleItem)}${(function() {
              const info = scheduleItem.transitInfo || '';
              // 시간 정보 추출 정규식 (예: 약 15분, 1시간 10분 등)
              const timeMatch = info.match(/(?:약\s*)?(\d+\s*시간)?\s*(\d+\s*분)/);
              if (timeMatch) {
                const transitTime = timeMatch[0];
                // 전체 소요 시간과 이동 시간이 다른 경우 혹은 이동 관련 키워드가 있는 경우에만 표시
                if (scheduleItem.duration !== transitTime || info.includes('이동') || info.includes('도보')) {
                   return ` <span class="gemini-transit-meta" style="opacity: 0.8; font-weight: normal; font-size: 0.85em;">(이동시간: ${transitTime})</span>`;
                }
              }
              return '';
            })()}</span>
          </div>
          ${(function() {
            const info = scheduleItem.practicalInfo;
            if (!info) return '';
            
            // Structured Object Format (Phase 4)
            if (typeof info === 'object' && !Array.isArray(info)) {
              const recs = info.top3Recommendations;
              const itemType = scheduleItem.type || '';
              const isDining = itemType === 'dining';
              const isCafe = itemType === 'cafe';

              // 객체 배열 포맷 (신규)
              let recsHtml = '';
              if (Array.isArray(recs) && recs.length > 0) {
                const recIcon = isDining ? '🍽️' : isCafe ? '☕️' : '⭐';
                const recLabel = isDining ? '추천 식당 Top 3' : isCafe ? '추천 카페 Top 3' : '추천 Top 3';
                const recItemsHtml = recs.map((rec, i) => {
                  const safeName = (rec.name || '').replace(/"/g, '&quot;');
                  const reviewHref = rec.reviewUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rec.name || '')}`;
                  const dirHref = rec.directionUrl || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(rec.name || '')}`;
                  return `<div class="rec-item">
                    <span class="rec-rank">${i + 1}.</span>
                    <span class="rec-name">${safeName}</span>
                    <span class="rec-rating">⭐ ${rec.rating || ''}</span>
                    <a href="${reviewHref}" target="_blank" rel="noopener noreferrer" class="rec-btn review">📋 리뷰보기</a>
                    <a href="${dirHref}" target="_blank" rel="noopener noreferrer" class="rec-btn direction">${icons.route} 길찾기</a>
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
                     <span class="info-icon">${isDining ? '🍽️' : isCafe ? '☕️' : '⭐'}</span>
                     <span class="info-value">
                       <span class="info-label">${isDining ? '추천 식당 Top 3' : isCafe ? '추천 카페 Top 3' : '추천 Top 3'}</span>
                       <div style="margin-top: 0.3rem; white-space: pre-line; line-height: 1.7;">${recs.trim()}</div>
                     </span>
                   </div>`;
              }

              // 값이 없는 줄은 아예 그리지 않는다. "현지 팁: —" 은 정보가
              // 없다는 뜻이 아니라 앱이 부실하다는 인상만 남긴다.
              const infoLine = (icon, label, value) => {
                const text = typeof value === 'string' ? value.trim() : '';
                if (!text || text === '—') return '';
                return `
                    <div class="info-row">
                      <span class="info-icon">${icon}</span>
                      <span class="info-value"><span class="info-label">${label}</span> ${text}</span>
                    </div>`;
              };

              // 현지 팁은 외국인 사용자에게 방문 여부를 가르는 정보다
              // (영어 메뉴 유무, 택스프리, 대기시간). 다른 메타 정보와 같은
              // 줄에 두지 않고 한 칸 올린다.
              const tipText = typeof info.localTip === 'string' ? info.localTip.trim() : '';
              const tipHtml = (!tipText || tipText === '—') ? '' : `
                    <div class="info-row tip">
                      <span class="info-icon">${icons.tip}</span>
                      <span class="info-value"><span class="info-label">${t('localTipLabel') || '현지 팁'}</span>${tipText}</span>
                    </div>`;

              const lines = [
                infoLine(icons.cost, `${t('estimatedCostLabel') || '예상 비용'}`, info.estimatedCost),
                infoLine(icons.hours, `${t('operatingHoursLabel') || '영업 시간'}`, info.operatingHours),
              ].join('');

              if (!lines && !tipHtml && !recsHtml) return '';

              return `
                <div class="quick-info-box structured">
                  <div class="info-group">${lines}${tipHtml}${recsHtml}
                  </div>
                </div>
              `;
            }
            
            // Legacy String Format (Phase 3 Fallback)
            return `
              <div class="quick-info-box">
                <span class="quick-info-icon">${icons.tip}</span>
                <div class="quick-info-text">${info}</div>
              </div>
            `;
          })()}
          ${linksHtml}
        </div>
      `;

      // 길찾기 버튼 이벤트 바인딩 — anchorEl(버튼 자체)을 넘겨 뷰포트 좌표 계산
      item.querySelectorAll('.item-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleItemEdit(btn.dataset.edit, Number(btn.dataset.idx));
        });
      });

      const navBtn = item.querySelector('.nav-btn');
      if (navBtn) {
        navBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const loc = navBtn.getAttribute('data-location');
          const gmaps = navBtn.getAttribute('data-gmaps');
          openNavPopup(loc, gmaps, navBtn, this.shadowRoot);
        });
      }

      container.appendChild(item);

      // 카드 사이 이동 정보 슬롯: 지도(map-view)가 계산한 실제 경로가 채워진다
      if (idx < items.length - 1) {
        const transitSlot = document.createElement('div');
        transitSlot.className = 'transit-info hidden';
        transitSlot.id = `transit-info-${idx}`;
        container.appendChild(transitSlot);

        // 여기에 장소를 끼워 넣을 수 있다는 걸 자리로 보여준다. 도착 뒤에는
        // 넣을 수 없으므로 마지막 카드 다음에는 만들지 않는다.
        const nextItem = items[idx + 1];
        if (isEditableItem(scheduleItem) || isEditableItem(nextItem)) {
          container.appendChild(this.buildInsertSlot(idx + 1));
        }
      }
    });

      // Fade In
      requestAnimationFrame(() => {
        container.style.opacity = '1';
      });
      
    }, 150); // wait for fade out
  }

  // Helper inside showResults (formerly at bottom of showResults)
  renderAds() {
      // 1. Shadow DOM 우회 및 광고 컨테이너 삽입 (Light DOM 영역)
      // 기존 광고가 있다면 제거 후 새로 생성 (SPA 라우팅 대응)
      const existingAd = this.querySelector('.adsense-wrapper');
      if (existingAd) existingAd.remove();

      const adWrapper = document.createElement('div');
      adWrapper.className = 'adsense-wrapper';
      adWrapper.style.cssText = 'margin-top: 40px; text-align: center; width: 100%;';
      adWrapper.innerHTML = `
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="ca-pub-2887038255405057"
             data-ad-slot="3531494624"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
      `;
      // shadowRoot가 아닌 컴포넌트 최상위에 붙이기 (Light DOM)
      this.appendChild(adWrapper);

      // 2. 광고 트리거 스크립트 실행
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error('AdSense 렌더링 에러:', e);
      }
  }
}

customElements.define('itinerary-view', ItineraryView);
