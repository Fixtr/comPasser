import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSharedItineraryUrl, DEFAULT_PUBLIC_APP_URL } from '../src/domains/itinerary/services/share-url.mjs';

test('웹 공유는 현재 사이트 주소를 사용하고 기존 쿼리나 경로를 옮기지 않는다', () => {
  assert.equal(buildSharedItineraryUrl('abc123', { origin: 'https://app.example' }), 'https://app.example/share/abc123');
  assert.equal(buildSharedItineraryUrl('abc123', { origin: 'http://localhost:5173' }), 'http://localhost:5173/share/abc123');
});

test('Android와 iOS에서 만든 공유 링크는 로컬 앱이 아닌 공개 웹을 연다', () => {
  for (const origin of ['https://localhost', 'http://localhost', 'capacitor://localhost']) {
    assert.equal(buildSharedItineraryUrl('abc123', { origin, isNative: true }), `${DEFAULT_PUBLIC_APP_URL}/share/abc123`);
  }
});

test('네이티브의 공개 웹 주소는 배포 설정으로 바꿀 수 있다', () => {
  assert.equal(buildSharedItineraryUrl('abc123', {
    origin: 'capacitor://localhost', isNative: true,
    publicAppUrl: 'https://new.example/old-path?next=discarded',
  }), 'https://new.example/share/abc123');
});

test('잘못된 ID나 공유 주소는 링크로 내보내지 않는다', () => {
  for (const id of ['', '../private', 'abc?next=other', 'abc\n', null]) {
    assert.throws(() => buildSharedItineraryUrl(id, { origin: 'https://app.example' }));
  }
  for (const publicAppUrl of ['javascript:alert(1)', 'capacitor://localhost', 'http://app.example', 'https://localhost', 'https://user:pass@app.example']) {
    assert.throws(() => buildSharedItineraryUrl('abc123', { isNative: true, publicAppUrl }));
  }
});
