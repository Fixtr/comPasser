import test from 'node:test';
import assert from 'node:assert/strict';
import { airportBufferMinutes, farFromCityKm, isAirportName } from '../functions/airport-buffer.mjs';
import { isAirportName as plannerIsAirportName } from '../src/domains/planner/services/flight-arrival.mjs';

const jeju = { lat: 33.5070772, lng: 126.4934311 };
const incheon = { lat: 37.4602, lng: 126.4407 };

test('the airport buffer follows the airport\'s distance to the trip city, within 45-150 minutes', () => {
  // Jeju Airport is 3.6 km from Jeju City: a flat 150 minutes emptied the afternoon.
  assert.equal(airportBufferMinutes('제주국제공항', jeju, 'jeju'), 45);
  // Incheon to Seoul keeps close to the old protection (measured transit there reached about 130 minutes).
  const icn = airportBufferMinutes('인천국제공항', incheon, 'seoul');
  assert.ok(icn >= 130 && icn <= 150, String(icn));
  assert.equal(airportBufferMinutes('Narita International Airport', { lat: 35.772, lng: 140.3929 }, 'tokyo'), 150);
});

test('a day that starts far from the airport keeps the longer buffer (Jeju trip with a Seogwipo hotel)', () => {
  const seogwipo = { lat: 33.2541, lng: 126.5601 };
  const fromSeogwipo = airportBufferMinutes('제주국제공항', jeju, 'jeju', seogwipo);
  assert.ok(fromSeogwipo >= 90 && fromSeogwipo <= 100, String(fromSeogwipo));
  // A start near downtown, at the airport itself, or without coordinates keeps the downtown estimate.
  assert.equal(airportBufferMinutes('제주국제공항', jeju, 'jeju', { lat: 33.4996, lng: 126.5312 }), 45);
  assert.equal(airportBufferMinutes('제주국제공항', jeju, 'jeju', jeju), 45);
  assert.equal(airportBufferMinutes('제주국제공항', jeju, 'jeju', '서귀포 호텔'), 45);
});

test('without a known city or valid coordinates the old 150 minutes stay; other places get no buffer', () => {
  assert.equal(airportBufferMinutes('인천국제공항 제1여객터미널', null, 'seoul'), 150);
  assert.equal(airportBufferMinutes('제주국제공항', jeju, 'atlantis'), 150);
  assert.equal(airportBufferMinutes('제주국제공항', jeju, undefined), 150);
  assert.equal(airportBufferMinutes('제주국제공항', { lat: 'x', lng: 126.49 }, 'jeju'), 150);
  assert.equal(airportBufferMinutes('제주국제공항', { lat: 133.5, lng: 126.49 }, 'jeju'), 150);
  assert.equal(airportBufferMinutes('서울역', { lat: 37.555, lng: 126.97 }, 'seoul'), null);
  assert.equal(airportBufferMinutes('', null, 'seoul'), null);
});

test('the planner and the server share one airport-name rule', () => {
  assert.equal(plannerIsAirportName, isAirportName);
  for (const name of ['인천국제공항', 'Haneda Airport', '羽田空港', 'Aéroport de Paris-Charles de Gaulle']) assert.ok(isAirportName(name), name);
  assert.equal(isAirportName('서울역'), false);
});

test('a place more than 150 km from the trip city is flagged with its rounded distance', () => {
  const kansai = { lat: 34.4347, lng: 135.244 };
  const gimhae = { lat: 35.1795, lng: 128.9382 };
  assert.equal(farFromCityKm(incheon, 'seoul'), null);
  assert.equal(farFromCityKm({ lat: 35.772, lng: 140.3929 }, 'tokyo'), null);
  assert.equal(farFromCityKm(kansai, 'kyoto'), null);
  const jejuFromSeoul = farFromCityKm(jeju, 'seoul');
  assert.ok(jejuFromSeoul >= 440 && jejuFromSeoul <= 460, String(jejuFromSeoul));
  assert.ok(farFromCityKm(gimhae, 'seoul') > 150);
  // Jeju's downtown override keeps its own airport near.
  assert.equal(farFromCityKm(jeju, 'jeju'), null);
  assert.equal(farFromCityKm(jeju, 'atlantis'), null);
  assert.equal(farFromCityKm('제주국제공항', 'seoul'), null);
  assert.equal(farFromCityKm(null, 'seoul'), null);
});
