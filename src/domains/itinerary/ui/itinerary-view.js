import { saveItinerary, createSharedItinerary, getItineraryById } from '../services/firestore-service.js';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { t, getLang } from '../../../utils/i18n.js';
import { trackEvent } from '../../../utils/analytics.js';

import { itineraryStyles } from './itinerary-style.js';
import { openNavPopup } from './nav-popup.js';
import { normalizeData } from '../services/itinerary-normalize.mjs';
import { buildItineraryTitle } from '../services/itinerary-title.mjs';
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
  }

  disconnectedCallback() {
    window.removeEventListener('transit-info-ready', this._transitInfoHandler);
    window.removeEventListener('transit-unavailable', this._transitUnavailableHandler);
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
          saveBtn.textContent = t('saveItineraryBtn') || '이 일정 저장하기 💾';
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
          showGlobalToast(t('shareSuccessAlert') || "🔗 공유 링크가 클립보드에 복사되었습니다!", { tone: 'success' });
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
        downloadBtn.textContent = "📸 이미지 생성 중...";
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
      
      this.showToast("이미지가 성공적으로 저장되었습니다! 📸");
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

    box.textContent = status === 'none'
      ? 'ℹ️ 실제 대중교통 소요시간을 확인하지 못했습니다. 아래 시각은 AI 추정치이며 실제와 다를 수 있습니다.'
      : `ℹ️ 전체 ${expected}개 구간 중 ${resolved}개만 실제 소요시간이 확인됐습니다. 나머지 구간의 시각은 AI 추정치입니다.`;
    box.style.display = 'block';
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

    box.textContent = `⚠️ 실제 이동시간을 반영하면 종료 예정 시각(${dayEndTime})보다 약 ${amount} 늦게 끝납니다. 마지막 일정을 줄이거나 빼는 것을 권장합니다.`;
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
        <div id="results-content" style="background: white;">
          <div id="fallback-warning" class="fallback-warning" role="alert" style="display: none;"></div>
          <div id="transit-notice" class="transit-notice" role="status" aria-live="polite" style="display: none;"></div>
          <div id="end-time-warning" class="end-time-warning" role="status" aria-live="polite" style="display: none;"></div>
          <h2 id="day-title-header" style="padding-top: 0.5rem; margin-top: 0; display: none;"></h2>
          <div id="day-tabs-container" class="day-tabs-container" style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem; margin-bottom: 1rem; border-bottom: 2px solid #f3f4f6;">
            <!-- Tabs injected dynamically -->
          </div>
          <div class="timeline" id="timeline-container" style="transition: opacity 0.3s ease-in-out;">
            <!-- Dynamically injected -->
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 2rem;">
          <button id="download-image-btn" class="download-btn">📸 일정 이미지로 저장하기</button>
          <button id="save-itinerary-btn" class="save-btn" data-i18n="saveItineraryBtn" style="margin-top: 0;">이 일정 저장하기 💾</button>
          <button id="share-itinerary-btn" class="share-btn" data-i18n="shareItineraryBtn">🔗 일정 공유하기</button>
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

    // 날짜를 바꾸면 경고/안내도 그 날짜 기준으로 다시 계산해야 한다.
    this.refreshEndTimeWarning();
    this.refreshTransitNotice();
    
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
          <div class="schedule-card" style="border-color: #ef4444; background: #fef2f2;">
            <div class="schedule-title" style="color: #b91c1c;">⚠️ 항목 없음</div>
            <div class="schedule-desc" style="color: #7f1d1d;">저장된 세부 일정이 없습니다.</div>
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

      const linksHtml = `
        <div class="action-links">
          ${scheduleItem?.officialWebsiteUrl ? `<a href="${scheduleItem.officialWebsiteUrl}" target="_blank" rel="noopener noreferrer" class="action-link-badge">🌐 홈페이지</a>` : ''}
          ${gmapsStr ? `<a href="${gmapsStr}" target="_blank" rel="noopener noreferrer" class="action-link-badge primary">📍 리뷰 보기</a>` : ''}
          <button class="nav-btn" data-location="${locationStr.replace(/"/g, '&quot;')}" data-gmaps="${gmapsStr.replace(/"/g, '&quot;')}">🗺️ 길찾기</button>
        </div>
      `;

      item.innerHTML = `
        <div class="time-badge">${timeDisplay}</div>
        <div class="schedule-card" data-type="${scheduleItem.type}" data-index="${idx + 1}">
          <div class="schedule-title">${scheduleItem.title}</div>
          ${(function() {
            const info = scheduleItem.transitInfo;
            if (!info) return '';
            
            const trimmedInfo = info.trim();
            // 강화된 필터링 키워드
            const skipKeywords = ['없음', '이동 완료', '정보 없음', 'null', 'undefined'];
            if (trimmedInfo === '' || skipKeywords.some(k => trimmedInfo.includes(k))) return '';
            
            return `<div class="schedule-desc gemini-transit" style="color: #059669; font-weight: 600; margin-top: 0.5rem; padding: 0.5rem; background: #ecfdf5; border-radius: 6px;">🚇 이동 안내: ${trimmedInfo}</div>`;
          })()}
          <div class="schedule-meta">
            <span class="meta-item">📍 ${locationStr}</span>
            <span class="meta-item">⏱ ${scheduleItem.duration}${(function() {
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
                    <a href="${dirHref}" target="_blank" rel="noopener noreferrer" class="rec-btn direction">🗺️ 길찾기</a>
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

              return `
                <div class="quick-info-box structured">
                  <div class="info-group">
                    <div class="info-row">
                      <span class="info-icon">💰</span>
                      <span class="info-value"><span class="info-label">예상 비용:</span> ${info.estimatedCost || '—'}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-icon">🕐</span>
                      <span class="info-value"><span class="info-label">영업 시간:</span> ${info.operatingHours || '—'}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-icon">💡</span>
                      <span class="info-value"><span class="info-label">현지 팁:</span> ${info.localTip || '—'}</span>
                    </div>
                    ${recsHtml}
                  </div>
                </div>
              `;
            }
            
            // Legacy String Format (Phase 3 Fallback)
            return `
              <div class="quick-info-box">
                <span class="quick-info-icon">💡</span>
                <div class="quick-info-text">${info}</div>
              </div>
            `;
          })()}
          ${linksHtml}
        </div>
      `;

      // 길찾기 버튼 이벤트 바인딩 — anchorEl(버튼 자체)을 넘겨 뷰포트 좌표 계산
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
