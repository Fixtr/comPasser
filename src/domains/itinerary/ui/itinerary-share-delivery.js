import { loadKakaoSdk } from '../../../utils/external-scripts.js';
import { t } from '../../../utils/i18n.js';

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
          title: t('kakaoShareTitle'),
          description: t('kakaoShareDescription'),
          imageUrl: 'https://images.unsplash.com/photo-1488646953014-c8c2eb5f2b2b',
          link: { mobileWebUrl: url, webUrl: url },
        },
        buttons: [{
          title: t('kakaoShareButton'),
          link: { mobileWebUrl: url, webUrl: url },
        }],
      });
    },
  };
}

export const itineraryShareDelivery = createItineraryShareDelivery();
