import test from 'node:test';
import assert from 'node:assert/strict';

import { GeocodingService } from '../src/domains/map/services/geocoding-service.js';

/**
 * Places 요청 언어가 사용자의 언어 설정을 따라가는지 확인한다.
 *
 * map/COMMAND_GUIDE.md 는 "모든 장소의 이름과 주소는 사용자의 언어 설정에
 * 맞춰 다국어로 지오코딩 및 표시되어야 한다" 고 요구하는데, 예전에는
 * language 가 'ko' 로 하드코딩돼 있어 영어 모드에서도 한글 이름이 돌아왔다.
 *
 * 언어는 사용자가 도중에 바꿀 수 있으므로 값이 아니라 함수를 주입한다.
 * 생성 시점의 언어를 붙잡아 두면 토글 후 첫 재계산까지 옛 언어가 남는다.
 */
function makeFakeLoader() {
  const requests = [];
  const loader = {
    importLibrary: async () => ({
      Place: {
        searchByText: async (request) => {
          requests.push(request);
          return {
            places: [{
              location: { lat: 37.5, lng: 127.0 },
              displayName: 'Gyeongbokgung Palace',
              formattedAddress: '161 Sajik-ro, Jongno-gu, Seoul',
            }],
          };
        },
      },
    }),
  };
  return { loader, requests };
}

test('언어를 주입하지 않으면 기존 동작(한국어)을 유지한다', async () => {
  const { loader, requests } = makeFakeLoader();
  const service = new GeocodingService(loader);
  await service.resolvePlace('경복궁');
  assert.equal(requests[0].language, 'ko');
  assert.equal(requests[0].region, 'kr', '지역은 KR 로 유지된다(PRD 한국 한정)');
});

test('주입된 언어를 Places 요청에 그대로 싣는다', async () => {
  const { loader, requests } = makeFakeLoader();
  const service = new GeocodingService(loader, { getLanguage: () => 'en' });
  await service.resolvePlace('Gyeongbokgung Palace');
  assert.equal(requests[0].language, 'en');
});

test('언어를 도중에 바꾸면 다음 요청부터 바로 반영된다', async () => {
  const { loader, requests } = makeFakeLoader();
  let lang = 'ko';
  const service = new GeocodingService(loader, { getLanguage: () => lang });

  await service.resolvePlace('경복궁');
  lang = 'en';
  await service.resolvePlace('Gyeongbokgung Palace');

  assert.equal(requests[0].language, 'ko');
  assert.equal(requests[1].language, 'en', '생성 시점 언어를 붙잡아 두면 안 된다');
});

test('알 수 없는 언어 값이 오면 한국어로 떨어진다', async () => {
  const { loader, requests } = makeFakeLoader();
  const service = new GeocodingService(loader, { getLanguage: () => undefined });
  await service.resolvePlace('경복궁');
  assert.equal(requests[0].language, 'ko');
});
