import { buildBoardingPass } from '../services/boarding-pass.mjs';
import { buildItineraryTitle } from '../services/itinerary-title.mjs';
import { normalizeData } from '../services/itinerary-normalize.mjs';
import { boardingPassStyles, renderBoardingPass } from './boarding-pass-view.js';
import { loadHtml2Canvas } from '../../../utils/external-scripts.js';
import { ROUTE_THEME_ATTR } from '../../../utils/route-theme.js';

/**
 * 일정 사본을 티켓 이미지로 내보낸다. 화면의 상태·버튼·알림은 알지 않는다.
 * 브라우저와 캡처 경계를 주입할 수 있어 실제 SDK 없이도 실패/취소를 검증한다.
 */
export function createItineraryImageExporter({
  browser = globalThis,
  loadCanvas = loadHtml2Canvas,
  renderTicket = renderBoardingPass,
} = {}) {
  /**
   * @param {{plan: object, dayIndex?: number, language?: string, labels?: object}} input 일정 상태의 snapshot
   * @returns {Promise<'empty'|'shared'|'cancelled'|'downloaded'>}
   * 캡처·다운로드 실패는 호출자에게 전달한다. 취소는 오류도 다운로드 요청도 아니다.
   */
  return async function exportImage({ plan, dayIndex = 0, language = 'ko', labels = {} }) {
    const pass = buildBoardingPass({
      plan: normalizeData(plan),
      dayIndex,
      title: buildItineraryTitle(plan, language),
      language,
    });
    if (!pass) return 'empty';

    const { document } = browser;
    const body = document.body;
    const stage = document.createElement('div');
    let canvas;

    try {
      // display:none 은 크기가 0 이다. 토큰을 상속받는 일반 DOM을 화면 밖에 세운다.
      stage.setAttribute('aria-hidden', 'true');
      Object.assign(stage.style, {
        position: 'fixed', left: '-10000px', top: '0', zIndex: '-1', pointerEvents: 'none',
      });
      const sheet = document.createElement('style');
      sheet.textContent = boardingPassStyles;
      const ticket = renderTicket(pass, {
        fixedLabel: labels.fixedLabel || '확정',
        transitLabel: labels.transitLabel || '이동',
        costLabel: labels.costLabel || '비용',
        moreLabel: n => language === 'en' ? `+ ${n} more` : `+ ${n}곳 더`,
      });
      stage.append(sheet, ticket);

      body.append(stage);

      // 캡처 엔진은 여전히 버튼을 누른 뒤에만 동적으로 읽는다.
      const html2canvas = await loadCanvas();
      canvas = await html2canvas(ticket, {
        scale: 2, useCORS: true, backgroundColor: null, logging: false,
        // 복제 문서만 밝게 한다. 실제 화면의 경로·사용자 테마는 읽거나
        // 복원하지 않아, 처리 중 이동/테마 변경/동시 캡처와 경합하지 않는다.
        // 배경도 복제 티켓의 --cp-surface 토큰이 그린다.
        onclone(clonedDocument) {
          clonedDocument.body.classList.remove('dark');
          clonedDocument.documentElement.setAttribute('data-theme', 'light');
          clonedDocument.documentElement.removeAttribute(ROUTE_THEME_ATTR);
        },
      });
    } finally {
      // 공유창이 닫힐 때까지 임시 티켓을 붙들지 않는다.
      stage.remove();
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('티켓 이미지를 생성하지 못했습니다.');

    const fileName = `compasser-${pass.code}.png`;
    const shared = await shareImage(browser, blob, fileName, pass);
    if (shared) return shared;

    const url = browser.URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
    } finally {
      // 다운로드를 시작하지 못했어도 이미지가 메모리에 남지 않게 한다.
      browser.URL.revokeObjectURL(url);
    }
    return 'downloaded';
  };
}

/** 미지원·제스처 만료는 다운로드로, 사용자의 취소는 추가 동작 없이 끝낸다. */
async function shareImage(browser, blob, fileName, pass) {
  const { navigator, File } = browser;
  if (typeof File !== 'function' || !navigator?.canShare || !navigator?.share) return null;
  const file = new File([blob], fileName, { type: 'image/png' });
  if (!navigator.canShare({ files: [file] })) return null;
  try {
    await navigator.share({
      files: [file],
      title: pass.route || 'ComPasser',
      text: `${pass.dayLabel} · ${pass.from} → ${pass.to}`,
    });
    return 'shared';
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
    console.warn('[boarding-pass] 공유 시트를 열지 못해 내려받기로 갑니다:', error);
    return null;
  }
}

export const exportItineraryImage = createItineraryImageExporter();
