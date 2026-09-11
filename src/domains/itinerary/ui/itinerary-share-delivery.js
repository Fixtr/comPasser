import { loadKakaoSdk } from '../../../utils/external-scripts.js';

/** 공개 여부는 actions가 결정한다. 여기는 만들어진 URL을 전달하는 일만 한다. */
export function createItineraryShareDelivery({ browser = globalThis, loadKakao = loadKakaoSdk } = {}) {
  return {
    async copyLink(url) {
      await browser.navigator.clipboard.writeText(url);
    },

    async shareToKakao(url) {
      const Kakao = await loadKakao();
      Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: '✈️ 나만의 스마트한 여행 일정이 도착했어요!',
          description: 'ComPasser에서 만든 완벽한 여행 타임라인과 지도를 지금 바로 확인해 보세요.',
          imageUrl: 'https://images.unsplash.com/photo-1488646953014-c8c2eb5f2b2b',
          link: { mobileWebUrl: url, webUrl: url },
        },
        buttons: [{
          title: '일정 자세히 보기',
          link: { mobileWebUrl: url, webUrl: url },
        }],
      });
    },
  };
}

export const itineraryShareDelivery = createItineraryShareDelivery();
