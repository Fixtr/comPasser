import test from 'node:test';
import assert from 'node:assert/strict';
import { publishableStops } from '../src/domains/itinerary/services/public-course.mjs';
import { courseCity, courseSpentInWon, filterCourses, validateCourseReview } from '../src/domains/itinerary/services/course-community.mjs';

test('course discovery combines address search, city and visit-duration filters', () => {
  const routes = [
    { title: 'Afternoon', stops: [{ name: 'Museum', location: '서울 Seoul', stayMinutes: 120 }] },
    { title: 'Beach', stops: [{ name: '海辺', location: 'Busan', stayMinutes: 240 }] },
  ];
  assert.deepEqual(filterCourses(routes, { search: 'MUSEUM seoul', city: 'seoul', duration: 'short' }), [routes[0]]);
  assert.deepEqual(filterCourses(routes, { city: 'busan', duration: 'half' }), [routes[1]]);
  assert.deepEqual(filterCourses(routes, { search: 'Museum', city: 'busan' }), []);
});

test('international course cities match local names and complete Latin city names', () => {
  const routes = ['東京都', '京都市', 'Paris, France', 'Nice, France', 'Venice, Italy', '부산'].map(location => ({ title: location, stops: [{ name: 'Walk', location, stayMinutes: 60 }] }));
  for (const [city, index] of [['tokyo', 0], ['kyoto', 1], ['paris', 2], ['nice', 3], ['busan', 5]]) {
    assert.deepEqual(filterCourses(routes, { city }), [routes[index]]);
  }
  assert.deepEqual(filterCourses(routes, { city: 'unknown' }), []);
});

test('a review link resolves its public course to the catalogue city that lists it', () => {
  const route = location => ({ title: 'Walk', stops: [{ name: 'Gate', location, stayMinutes: 60 }] });
  for (const [location, city] of [['浅草寺, Tokyo', 'tokyo'], ['東京都', 'tokyo'], ['京都市', 'kyoto'], ['Seoul Museum', 'seoul']]) {
    assert.equal(courseCity(route(location)), city);
    assert.deepEqual(filterCourses([route(location)], { city }), [route(location)]);
  }
  assert.equal(courseCity(route('Venice, Italy')), null);
});

test('review spending counts as won only when every city the route names is Korean', () => {
  const route = (...locations) => ({ stops: locations.map(location => ({ name: 'Gate', location, stayMinutes: 60 })) });
  assert.equal(courseSpentInWon(route('Seoul Museum', '부산 해운대')), true);
  assert.equal(courseSpentInWon(route('浅草寺, Tokyo')), false);
  assert.equal(courseSpentInWon(route('Seoul Garden, Tokyo')), false);
  assert.equal(courseSpentInWon(route('Venice, Italy')), false);
});

test('review spending currency follows the address, not shop names or foreign words inside them', () => {
  const stop = (name, location) => ({ stops: [{ name, location, stayMinutes: 60 }] });
  for (const [name, location] of [
    ['런던베이글뮤지엄 안국점', '서울 종로구'], ['파리바게뜨 강남점', '서울 강남구'], ['Nice Cafe', 'Seoul'],
    ['테니스장', '서울 강남구 테니스장'], ['빵집', '서울 파리바게뜨 강남점'], ['호텔', '서울 마포구 비즈니스호텔'], ['Cafe', 'Nice Cafe, Seoul'],
    ['불국사', '경주 불국사'], ['황리단길', '경주 황리단길'], ['시장', '강원 속초시'], ['화성', '대한민국 경기도 수원시'],
    ['경복궁', '서울특별시 종로구 사직로 161'], ['광장', '대한민국 서울특별시'], ['Palace', '161 Sajik-ro, Jongno District, Seoul 03045, South Korea'],
    ['Temple', 'Bulguksa, Gyeongju'],
  ]) assert.equal(courseSpentInWon(stop(name, location)), true, `${name} / ${location}`);
  for (const [name, location] of [
    ['Busan Pork Soup', 'Osaka, Japan'], ['Seoul Tofu House', 'Vancouver, Canada'], ['식당', '오사카 서울식당'],
    ['서울식당', '일본 오사카부 오사카시'], ['Korea House', '1 Main St, Los Angeles, CA 90001, USA'], ['Shop', ''],
  ]) assert.equal(courseSpentInWon(stop(name, location)), false, `${name} / ${location}`);
  assert.equal(courseSpentInWon({ stops: [] }), false);
  assert.equal(courseSpentInWon({ stops: [{ name: 'a', location: 'Seoul' }, { name: 'b', location: 'Tokyo' }] }), false);
});

test('travel reviews reject future/impossible dates and invalid actual metrics', () => {
  const input = { visitDate: '2026-10-04', comment: ' Easy to walk ', walkingKm: '2.5', spentWon: '', visitMinutes: '90' };
  assert.deepEqual(validateCourseReview(input, '2026-10-05'), { visitDate: '2026-10-04', comment: 'Easy to walk', walkingKm: 2.5, spentWon: null, visitMinutes: 90 });
  for (const patch of [{ visitDate: '2026-02-30' }, { visitDate: '2026-10-06' }, { comment: ' ' }, { walkingKm: -1 }, { spentWon: 0.5 }, { visitMinutes: 1441 }]) {
    assert.throws(() => validateCourseReview({ ...input, ...patch }, '2026-10-05'));
  }
});

test('public preview excludes private endpoints, appointments and unresolved AI places', () => {
  const plan = { days: [{ date: '2026-11-01', scheduleItems: [
    { type: 'departure', title: 'Hotel', location: 'Private address' },
    { type: 'AnchorSchedule', title: 'Medical appointment', location: 'Private clinic' },
    { type: 'attraction', title: 'Museum', location: 'Seoul Museum', duration: 90 },
    { type: 'dining', title: 'Lunch', location: 'Seoul cafe', duration: 60 },
    { type: 'leisure', title: 'Maybe', location: 'Hotel', placeIntent: 'walk', placeStatus: 'unresolved' },
    { type: 'arrival', title: 'Hotel', location: 'Private address' },
  ] }] };
  assert.deepEqual(publishableStops(plan), [
    { name: 'Museum', location: 'Seoul Museum', stayMinutes: 90 },
    { name: 'Lunch', location: 'Seoul cafe', stayMinutes: 60 },
  ]);
});
