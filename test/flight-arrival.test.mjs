import test from 'node:test';
import assert from 'node:assert/strict';
import { airportArrivalTime, isAirportName, tripStartAfterLanding } from '../src/domains/planner/services/flight-arrival.mjs';

test('the trip starts 1 hour after an international and 30 minutes after a domestic landing', () => {
  assert.equal(tripStartAfterLanding('10:00', 'international'), '11:00');
  assert.equal(tripStartAfterLanding('10:00', 'domestic'), '10:30');
  assert.equal(tripStartAfterLanding('23:30', 'international'), null);
  assert.equal(tripStartAfterLanding('10:00', 'charter'), null);
});

test('the airport arrival is 3 hours before an international and 90 minutes before a domestic flight', () => {
  assert.equal(airportArrivalTime('21:00', 'international'), '18:00');
  assert.equal(airportArrivalTime('21:00', 'domestic'), '19:30');
  assert.equal(airportArrivalTime('03:00', 'international'), '00:00');
});

test('a flight soon after midnight, a bad time or an unknown kind leaves the end time to the user', () => {
  assert.equal(airportArrivalTime('01:30', 'international'), null);
  assert.equal(airportArrivalTime('', 'domestic'), null);
  assert.equal(airportArrivalTime('25:00', 'domestic'), null);
  assert.equal(airportArrivalTime('21:00', 'charter'), null);
});

test('airports are recognised by name in the supported languages', () => {
  for (const name of ['인천국제공항', 'Gimpo International Airport', '羽田空港', 'Aéroport de Paris-Charles de Gaulle', 'Aeroport Orly'])
    assert.equal(isAirportName(name), true, name);
  for (const name of ['서울역', '', null, 'Harbourview Hotel']) assert.equal(isAirportName(name), false, String(name));
});
