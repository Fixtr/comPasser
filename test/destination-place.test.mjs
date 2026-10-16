import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { destinations } from '../src/domains/planner/services/travel-destinations.mjs';
import { travelRegion } from '../functions/travel-region.mjs';
import { tFor } from '../src/utils/i18n.js';
import { GeocodingService } from '../src/domains/map/services/geocoding-service.js';

// Public Places responses checked on 2026-10-12; the suite makes no live requests.
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/destination-places.json', import.meta.url)));
const loader = candidates => ({ importLibrary: async () => ({ Place: { searchByText: async () => ({ places: candidates }) } }) });

test('all 111 catalogue places resolve their observed Google names with country checks', async () => {
  assert.equal(new Set(destinations.map(city => city.country)).size, 11);
  assert.equal(destinations.length, 24);
  assert.equal(fixtures.length, 111);
  for (const city of destinations) {
    for (const place of city.places) {
      const fixture = fixtures.find(row => row.city === city.id && row.id === place.id);
      assert.ok(fixture, `${city.id}/${place.id}`);
      const countryCode = travelRegion({ destination: city }).countryCode;
      const service = new GeocodingService(loader([fixture.place]), { countryCode });
      const name = place.englishName || tFor(`${place.key}Name`, 'ko');
      const found = await service.resolvePlace(place.searchLocation || `${name}, ${tFor(city.key, 'en')}`, null, name,
        { aliases: place.searchAliases, countryCode });
      assert.equal(found?.resolvedPlace?.placeId, fixture.place.id, `${city.id}/${name}`);
    }
  }
});

test('catalogue aliases reject another country, unrelated names and malformed snapshots', async () => {
  const { place } = fixtures.find(row => row.id === '浅草寺');
  const options = { aliases: ['Sensō-ji'], countryCode: 'JP' };
  for (const invalid of [
    { ...place, addressComponents: [{ types: ['country'], shortText: 'KR' }] },
    { ...place, addressComponents: [] },
    { ...place, displayName: 'Sensō-ji souvenir shop' },
    { ...place, displayName: 'Other temple' },
    { ...place, id: '' },
    { ...place, location: { lat: NaN, lng: 139 } },
  ]) {
    const service = new GeocodingService(loader([invalid]), { countryCode: 'JP' });
    assert.equal(await service.resolvePlace('Sensoji Temple, Tokyo', null, 'Sensoji Temple', options), null);
  }
  const service = new GeocodingService(loader([{ ...place, id: '' }, place]), { countryCode: 'JP' });
  assert.equal((await service.resolvePlace('Sensoji Temple, Tokyo', null, 'Sensoji Temple', options)).resolvedPlace.placeId, place.id);
  assert.equal(await service.resolvePlace('Sensoji Temple, Tokyo', null, 'Sensoji Temple'), null);
});

test('scoped catalogue lookup exposes provider quota failures to the caller', async () => {
  const error = new Error('PLACES_SEARCH_TEXT: RESOURCE_EXHAUSTED: SearchTextRequest per day');
  const service = new GeocodingService({ importLibrary: async () => ({ Place: { searchByText: async () => { throw error; } } }) }, { countryCode: 'JP' });
  await assert.rejects(service.resolvePlace('Sensoji Temple, Tokyo', null, 'Sensoji Temple', { countryCode: 'JP' }), error);
});
