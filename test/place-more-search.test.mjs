import test from 'node:test';
import assert from 'node:assert/strict';

import { GeocodingService } from '../src/domains/map/services/geocoding-service.js';

// Autocomplete matches registered names only: '해변열차' never finds 해운대블루라인파크, text search does.
function loaderReturning(places) {
  const requests = [];
  const loader = { importLibrary: async () => ({ Place: { searchByText: async request => { requests.push(request); return { places }; } } }) };
  return { loader, requests };
}

const station = { id: 'blue-mipo', displayName: '해운대블루라인파크 미포정거장', formattedAddress: '부산광역시 해운대구 달맞이길62번길 13', location: { lat: () => 35.1588, lng: () => 129.1705 }, addressComponents: [{ types: ['country'], shortText: 'KR' }] };
const osaka = { ...station, id: 'usj', displayName: 'Universal Studios Japan', addressComponents: [{ types: ['country'], shortText: 'JP' }] };

test('더 찾기는 도시 이름을 붙여 문장 검색하고 여행 국가 안의 고를 수 있는 장소만 돌려준다', async () => {
  const { loader, requests } = loaderReturning([osaka, station, { id: 'broken', displayName: '주소 없음', addressComponents: [{ types: ['country'], shortText: 'KR' }] }]);
  const places = await new GeocodingService(loader, { countryCode: 'KR' }).searchPlaces('해변열차', 'Busan');
  assert.equal(requests[0].textQuery, '해변열차 Busan');
  assert.equal(requests[0].region, 'kr');
  assert.equal(requests[0].language, 'ko');
  assert.equal(requests[0].maxResultCount, 5);
  assert.deepEqual(requests[0].fields, ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents']);
  assert.deepEqual(places, [{ placeId: 'blue-mipo', displayName: '해운대블루라인파크 미포정거장', formattedAddress: '부산광역시 해운대구 달맞이길62번길 13', lat: 35.1588, lng: 129.1705 }]);
});

test('도시를 모르면 입력한 글자만으로 찾는다', async () => {
  const { loader, requests } = loaderReturning([]);
  assert.deepEqual(await new GeocodingService(loader, { getLanguage: () => 'en', countryCode: 'JP' }).searchPlaces('Skytree'), []);
  assert.equal(requests[0].textQuery, 'Skytree');
  assert.equal(requests[0].region, 'jp');
  assert.equal(requests[0].language, 'en');
});
