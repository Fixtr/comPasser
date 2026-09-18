import test from 'node:test';
import assert from 'node:assert/strict';
import { GeocodingService } from '../src/domains/map/services/geocoding-service.js';
import { matchesPlaceIdentity, schedulePlaceName } from '../src/domains/map/services/place-match.mjs';

const point = { lat: 37.5, lng: 127 };
const place = name => ({ location: point, displayName: name, formattedAddress: '서울특별시 강서구 주소' });
const mall = { title: '롯데몰 김포공항점', location: '서울특별시 강서구 공항대로 270' };
function setup(respond) {
  const requests = [];
  const service = new GeocodingService({ importLibrary: async () => ({ Place: {
    searchByText: async request => { requests.push(request); return { places: respond(request, requests.length) }; }
  } }) });
  return { service, requests };
}

test('주소가 학원을 가리키면 이름으로 재검색하고 쇼핑몰만 채택한다', async () => {
  const { service, requests } = setup((_, n) => [place(n === 1 ? '조율뮤직앤아트학원' : mall.title)]);
  const [result] = await service.geocodeSchedule([mall]);
  assert.equal(requests[0].textQuery, `${mall.title} ${mall.location}`);
  assert.equal(requests[1].textQuery, mall.title);
  assert.equal(result.resolvedName, mall.title);
});

test('첫 후보를 맹목적으로 채택하지 않고 이름이 맞는 후보를 선택한다', async () => {
  const { service, requests } = setup(() => [place('학원'), place('롯데몰 김포공항')]);
  const [result] = await service.geocodeSchedule([mall]);
  assert.equal(result.resolvedName, '롯데몰 김포공항');
  assert.equal(requests.length, 1);
});

test('두 검색이 모두 불일치하면 잘못된 좌표를 반환하지 않는다', async () => {
  const { service, requests } = setup(() => [place('조율뮤직앤아트학원')]);
  assert.deepEqual(await service.geocodeSchedule([mall]), []);
  assert.equal(requests.length, 2);
});

test('지점·빈 이름·다른 문자 표기를 같은 장소라는 증거로 간주하지 않는다', () => {
  for (const found of ['롯데몰 수원점', '롯데몰', '', 'Lotte Mall Gimpo Airport', '롯데몰 김포공항점 앞 편의점']) {
    assert.equal(matchesPlaceIdentity(mall.title, found), false, found);
  }
  assert.equal(matchesPlaceIdentity('LOTTE Mall (Gimpo)', 'lotte mall gimpo'), true);
});

test('저장된 불일치 좌표는 재검증하며 원본 일정은 변경하지 않는다', async () => {
  const item = { ...mall, latLng: {lat: 1, lng: 2}, resolvedName: '학원' };
  const before = structuredClone(item);
  const { service } = setup(() => [place(mall.title)]);
  const [result] = await service.geocodeSchedule([item]);
  assert.equal(result.resolvedName, mall.title);
  assert.deepEqual(item, before);
  assert.notDeepEqual(result.latLng, item.latLng);
});

test('이미 검증한 장소 좌표는 불필요하게 재검색하지 않는다', async () => {
  const item = { ...mall, latLng: point, resolvedName: mall.title, resolvedAddress:'서울특별시 강서구 주소' };
  const { service, requests } = setup(() => []);
  assert.equal((await service.geocodeSchedule([item]))[0], item);
  assert.equal(requests.length, 0);
});

test('출발점 좌표 편향과 원래 일정 번호를 유지한다', async () => {
  const { service, requests } = setup(request => [place(request.textQuery.includes(mall.title) ? mall.title : '서울역')]);
  const result = await service.geocodeSchedule([
    { type: 'departure', title: '출발 · 서울역', location: '서울역', displayIndex: 1 },
    { ...mall, displayIndex: 2 }
  ]);
  assert.equal(requests[0].textQuery, '서울역');
  assert.deepEqual(requests[1].locationBias, point);
  assert.equal(result[1].displayIndex, 2);
});

test('앵커 행사명을 상호명으로 오인하지 않으며 구체적인 카페 이름은 사용한다', () => {
  assert.equal(schedulePlaceName({type:'AnchorSchedule', title:'친구와 공연',location:'공연장'}), '');
  assert.equal(schedulePlaceName({title:'카페 레이어드 안국점'}), '카페 레이어드 안국점');
});

test('좌표가 없는 동명 후보도 채택하지 않는다', async () => {
  const { service } = setup(() => [{displayName:mall.title}]);
  assert.deepEqual(await service.geocodeSchedule([mall]), []);
});

test('공원 산책은 도로가 아니라 공원 이름으로 검증한다', async () => {
  const { service, requests } = setup((_, n) => [{...place(n === 1 ? '이촌로' : '용산가족공원'),formattedAddress:'서울특별시 용산구 서빙고로 185'}]);
  const [result] = await service.geocodeSchedule([{title:'용산가족공원 산책',location:'서울특별시 용산구 이촌로242'}]);
  assert.equal(result.resolvedName, '용산가족공원');
  assert.equal(requests[1].textQuery, '용산가족공원');
});

test('이름이 같아도 다른 구의 식당과 이전 저장 좌표는 채택하지 않는다', async () => {
  const {service,requests} = setup(() => [place('남도반찬')]);
  assert.deepEqual(await service.geocodeSchedule([{title:'점심 식사 - 남도반찬',location:'서울특별시 용산구 이촌로 129',latLng:point,resolvedName:'남도반찬',resolvedAddress:'서울특별시 강서구 방화동'}]), []);
  assert.equal(requests.length, 2);
});

test('일반 식사 추천은 다른 주소의 첫 후보나 오래된 좌표를 사용하지 않는다', async () => {
  const { service, requests } = setup(() => [place('에어파인')]);
  for (const title of ['마곡 맛집 (점심)', '점심 식사', '주변 맛집', 'Lunch nearby']) {
    assert.deepEqual(await service.geocodeSchedule([{title,location:'마곡중앙8로 35',latLng:point,resolvedName:'에어파인'}]), []);
  }
  assert.equal(requests.length, 0);
});

test('활동 접미사를 제거하되 남은 장소 이름의 일치는 여전히 요구한다', () => {
  assert.equal(schedulePlaceName({title:'국립중앙박물관 관람'}), '국립중앙박물관');
  assert.equal(schedulePlaceName({title:'서울숲 (산책)'}), '서울숲');
  assert.equal(schedulePlaceName({title:'Walk around Seoul Forest'}), 'Seoul Forest');
  assert.equal(schedulePlaceName({title:''}), null);
  assert.equal(schedulePlaceName({title:'점심 식사 - 남도반찬'}), '남도반찬');
  assert.equal(schedulePlaceName({title:'Lunch: Restaurant A'}), 'Restaurant A');
});
