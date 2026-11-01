import test from 'node:test';
import assert from 'node:assert/strict';
import { createItineraryShareDelivery } from '../src/domains/itinerary/ui/itinerary-share-delivery.js';
import { getLang, setLang } from '../src/utils/i18n.js';

const url = 'https://app.example/share/public123';

test('링크 복사는 주어진 URL만 전달하고 카카오 SDK를 불러오지 않는다', async () => {
  const copied = [];
  let loads = 0;
  const delivery = createItineraryShareDelivery({
    browser: { navigator: { clipboard: { async writeText(value) { copied.push(value); } } } },
    loadKakao: async () => { loads++; },
  });
  assert.equal(loads, 0, '전달기를 만들 때 외부 SDK를 켜지 않는다');
  await delivery.copyLink(url);
  assert.deepEqual(copied, [url]);
  assert.equal(loads, 0);
});

test('카카오 공유를 누른 때 SDK를 기다리고 기존 내용의 모든 링크를 전달한다', async () => {
  const payloads = [];
  let loads = 0;
  let finish;
  const sdk = new Promise(resolve => { finish = resolve; });
  const delivery = createItineraryShareDelivery({
    loadKakao: () => { loads++; return sdk; },
  });
  assert.equal(loads, 0);
  const pending = delivery.shareToKakao(url);
  assert.equal(loads, 1);
  assert.deepEqual(payloads, []);
  finish({ Share: { sendDefault: payload => payloads.push(payload) } });
  await pending;
  assert.deepEqual(payloads, [{
    objectType: 'feed',
    content: {
      title: '✈️ 나만의 스마트한 여행 일정이 도착했어요!',
      description: 'ComPasser에서 만든 완벽한 여행 타임라인과 지도를 지금 바로 확인해 보세요.',
      imageUrl: 'https://images.unsplash.com/photo-1488646953014-c8c2eb5f2b2b',
      link: { mobileWebUrl: url, webUrl: url },
    },
    buttons: [{ title: '일정 자세히 보기', link: { mobileWebUrl: url, webUrl: url } }],
  }]);
});

test('영어 사용자가 보내는 카카오 메시지는 영어로 나간다', async () => {
  const before = getLang();
  setLang('en');
  try {
    const payloads = [];
    const delivery = createItineraryShareDelivery({
      loadKakao: async () => ({ Share: { sendDefault: payload => payloads.push(payload) } }),
    });
    await delivery.shareToKakao(url);
    const [{ content, buttons }] = payloads;
    assert.equal(content.title, '✈️ A travel plan has arrived for you!');
    assert.equal(content.description, 'See the full timeline and map made with ComPasser.');
    assert.equal(buttons[0].title, 'View trip details');
  } finally {
    setLang(before);
  }
});

test('클립보드 권한 오류는 화면이 알리고 재시도할 수 있도록 전달한다', async () => {
  const error = new Error('clipboard denied');
  const delivery = createItineraryShareDelivery({
    browser: { navigator: { clipboard: { async writeText() { throw error; } } } },
  });
  await assert.rejects(delivery.copyLink(url), thrown => thrown === error);
});

test('카카오 SDK 로딩과 전송 오류 모두 호출자에게 전달한다', async () => {
  const error = new Error('Kakao unavailable');
  for (const loadKakao of [
    async () => { throw error; },
    async () => ({ Share: { sendDefault() { throw error; } } }),
  ]) {
    const delivery = createItineraryShareDelivery({ loadKakao });
    await assert.rejects(delivery.shareToKakao(url), thrown => thrown === error);
  }
});
