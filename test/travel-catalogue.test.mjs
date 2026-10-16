import test from 'node:test';
import assert from 'node:assert/strict';
import { destinations, destinationCountries } from '../src/domains/planner/services/travel-destinations.mjs';
import { TRAVEL_REGIONS, travelRegion, travelInstant } from '../functions/travel-region.mjs';
import { toPlannerDraft } from '../src/domains/planner/services/planner-draft.mjs';
import { courseCities, curatedRoute, publicRouteUrl } from '../src/domains/itinerary/services/public-route.mjs';
import { addCourseToDraft } from '../src/domains/planner/services/course-draft.mjs';
import { filterCourses } from '../src/domains/itinerary/services/course-community.mjs';
import { tFor } from '../src/utils/i18n.js';
import { cities } from '../src/domains/planner/services/discovery-catalogue.mjs';
import { createRequire } from 'node:module';
const { PLACE_IDS } = createRequire(import.meta.url)('../functions/discovery-saves.js');

test('each domestic city offers six translated places accepted by the save boundary', () => {
  for (const city of cities) {
    assert.equal(city.places.length, 6);
    for (const place of city.places) {
      assert.ok(PLACE_IDS.has(place.id));
      assert.ok(place.guide.startsWith('https://'));
      for (const lang of ['ko', 'en']) for (const suffix of ['Name', 'Area', 'Tag', 'Description', 'Location']) {
        assert.notEqual(tFor(`${place.key}${suffix}`, lang), `${place.key}${suffix}`);
      }
    }
  }
});

test('every offered country/city has server support, translations and a usable curated course', () => {
  assert.equal(destinationCountries.length, 11);
  assert.deepEqual(courseCities.map(city => city.id).sort(), destinations.map(city => city.id).sort());
  for (const country of destinationCountries) {
    assert.deepEqual(destinations.filter(city => city.country === country).map(city => city.id).sort(), [...TRAVEL_REGIONS[country].cities].sort());
    assert.ok(destinations.some(city => city.country === country));
    assert.notEqual(tFor(`country${country}`, 'ko'), `country${country}`);
    assert.notEqual(tFor(`country${country}`, 'en'), `country${country}`);
  }
  for (const city of destinations) {
    assert.ok(TRAVEL_REGIONS[city.country].cities.includes(city.id));
    assert.notEqual(tFor(city.key, 'ko'), city.key);
    const destination = { id: city.id, country: city.country, name: tFor(city.key, 'en') };
    assert.deepEqual(toPlannerDraft({ country: city.country, destination }).destination, destination);
    const course = curatedRoute(`curated-${city.id}`);
    assert.equal(course.stops.length, 2);
    assert.ok(publicRouteUrl(course.id).endsWith(`/en/routes/${course.id}`));
    assert.equal(filterCourses([course], { city: city.id }).length, 1);
  }
});

test('international course import retains endpoints and bookings, stores its region and avoids duplicate visits', () => {
  const course = curatedRoute('curated-newyork');
  const draft = { anchorSchedules: [{ name: 'Booking', location: 'Hotel', time: '18:00' }], startLocation: 'Hotel', endLocation: 'Station' };
  const imported = toPlannerDraft(addCourseToDraft(draft, course));
  assert.equal(imported.destination.country, 'USA');
  assert.equal(imported.destination.id, 'newyork');
  assert.equal(imported.startLocation, 'Hotel');
  assert.deepEqual(imported.anchorSchedules[0].name, 'Booking');
  assert.equal(addCourseToDraft(imported, course).anchorSchedules.length, 3);
  assert.equal(draft.anchorSchedules.length, 1);
});

test('Japanese and French courses provide localized display and imported names', () => {
  for (const city of destinations.filter(city => ['JPN', 'FRA'].includes(city.country))) {
    for (const suffix of ['', '-2', '-3']) {
      const course = curatedRoute(`curated-${city.id}${suffix}`);
      assert.ok(course.stops.every(stop => stop.name !== stop.englishName && stop.englishName));
      for (const lang of ['ko', 'en']) {
        const imported = addCourseToDraft({ anchorSchedules: [] }, course, lang);
        assert.deepEqual(imported.anchorSchedules.map(stop => stop.name), course.stops.map(stop => lang === 'en' ? stop.englishName : stop.name));
      }
    }
  }
});

test('new travel regions use their local clocks, including US and UK daylight saving', () => {
  for (const [country, summer, winter] of [['USA', '13:00', '14:00'], ['GBR', '08:00', '09:00'], ['TWN', '01:00', '01:00'], ['THA', '02:00', '02:00']]) {
    const zone = travelRegion({ destination: { country } }).timeZone;
    assert.equal(travelInstant('2030-07-01', '09:00', zone).toISOString(), `2030-07-01T${summer}:00.000Z`);
    assert.equal(travelInstant('2030-12-01', '09:00', zone).toISOString(), `2030-12-01T${winter}:00.000Z`);
  }
  assert.equal(travelInstant('2030-03-10', '02:30', 'America/New_York'), null);
});

test('city aliases do not match longer unrelated names', () => {
  const course = location => ({ title: 'Walk', stops: [{ name: 'Park', location, stayMinutes: 60 }] });
  for (const [city, location] of [['newyork', 'New Yorkshire'], ['rome', 'Chromebook'], ['london', 'Londonderry']]) {
    assert.equal(filterCourses([course(location)], { city }).length, 0);
  }
  assert.equal(filterCourses([course('Hà Nội')], { city: 'hanoi' }).length, 1);
});


test('seven US cities offer six distinct localized landmarks and usable course variants', () => {
  const american = destinations.filter(city => city.country === 'USA');
  assert.equal(american.length, 7);
  for (const city of american) {
    assert.equal(city.places.length, 6);
    assert.equal(new Set(city.places.map(place => place.id)).size, 6);
    assert.equal(new Set(city.places.map(place => place.englishName)).size, 6);
    for (const place of city.places) {
      assert.ok(place.name && place.englishName && place.name !== place.englishName);
      assert.ok(place.location && place.guide.startsWith('https://') && place.stayMinutes > 0);
    }
    for (const suffix of ['', '-2', '-3']) {
      const course = curatedRoute(`curated-${city.id}${suffix}`);
      assert.equal(filterCourses([course], {city:city.id}).length, 1);
      const imported = addCourseToDraft({anchorSchedules:[]}, course, 'en');
      assert.equal(imported.destination.id, city.id);
      assert.deepEqual(imported.anchorSchedules.map(stop=>stop.name), course.stops.map(stop=>stop.englishName));
    }
  }
  assert.equal(filterCourses([{title:'Park',stops:[{name:'Park',location:'Washington State',stayMinutes:60}]}], {city:'washingtondc'}).length, 0);
});

test('US city time zones honor DST while Honolulu remains on Hawaii time', () => {
  for (const [id, zone, summer, winter] of [
    ['newyork','America/New_York','13','14'], ['washingtondc','America/New_York','13','14'],
    ['chicago','America/Chicago','14','15'], ['losangeles','America/Los_Angeles','16','17'],
    ['sanfrancisco','America/Los_Angeles','16','17'], ['lasvegas','America/Los_Angeles','16','17'],
    ['honolulu','Pacific/Honolulu','19','19'],
  ]) {
    const region = travelRegion({destination:{country:'USA',id}});
    assert.equal(region.timeZone, zone);
    assert.equal(region.countryCode,'US');
    assert.equal(travelInstant('2030-07-01','09:00',zone).toISOString(),`2030-07-01T${summer}:00:00.000Z`);
    assert.equal(travelInstant('2030-12-01','09:00',zone).toISOString(),`2030-12-01T${winter}:00:00.000Z`);
    assert.equal(Boolean(travelInstant('2030-03-10','02:30',zone)), id==='honolulu');
  }
  for (const id of ['unknown','toString','__proto__']) assert.equal(travelRegion({destination:{country:'USA',id}}).timeZone,'America/New_York');
  assert.equal(TRAVEL_REGIONS.USA.timeZone,'America/New_York');
  assert.equal(travelRegion({destination:{country:'JPN',id:'honolulu'}}).timeZone,'Asia/Tokyo');
});
