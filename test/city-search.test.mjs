import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCities } from '../src/domains/planner/services/city-search.mjs';
import { destinations } from '../src/domains/planner/services/travel-destinations.mjs';
import { tFor } from '../src/utils/i18n.js';

// The home screen's call: the screen-language city name, its other-language name, then the country in both.
const other = lang => (lang === 'ko' ? 'en' : 'ko');
const ids = (query, lang = 'ko') => searchCities(query, destinations, city => tFor(city.key, lang), city => tFor(city.key, other(lang)),
  city => tFor(`country${city.country}`, lang), city => tFor(`country${city.country}`, other(lang))).map(city => city.id);
const inCountry = country => destinations.filter(city => city.country === country).map(city => city.id);

test('a Korean prefix finds the city, in the catalogue it came from', () => {
  assert.deepEqual(ids('부'), ['busan']);
  assert.deepEqual(ids('부산'), ['busan']);
  assert.equal(searchCities('부', destinations, city => tFor(city.key, 'ko'))[0], destinations.find(city => city.id === 'busan'));
});

test('every keystroke of a Korean name keeps its city in the list (IME composition)', () => {
  // 부산 is typed ㅂ, 부, 붓, 부사, 부산; 서울 passes through 성 and 서우; 워싱턴 through 우.
  for (const typed of ['ㅂ', '부', '붓', '부사', '부산']) assert.ok(ids(typed).includes('busan'), typed);
  for (const typed of ['ㅅ', '서', '성', '서우', '서울']) assert.ok(ids(typed).includes('seoul'), typed);
  for (const typed of ['우', '워', '웟', '워시', '워싱ㅌ']) assert.ok(ids(typed).includes('washingtondc'), typed);
});

test('English ignores case, spaces and punctuation and matches from any word', () => {
  assert.deepEqual(ids('NEW', 'en'), ['newyork']);
  assert.deepEqual(ids('york', 'en'), ['newyork']);
  assert.deepEqual(ids('newy', 'en'), ['newyork']);
  assert.deepEqual(ids(' washington dc ', 'en'), ['washingtondc']);
  assert.deepEqual(ids('ork', 'en'), []);
});

test('several matches come back with whole-name prefixes first, then catalogue order', () => {
  // City names first, in catalogue order; then the cities of countries starting with "s", then of 'United States'.
  const found = ids('s', 'en');
  const byName = searchCities('s', destinations, city => tFor(city.key, 'en')).map(city => city.id);
  assert.ok(byName.length > 1);
  assert.deepEqual(byName, [...byName].sort((a, b) => order(a) - order(b)));
  const rest = countries => destinations.filter(city => countries.includes(city.country) && !byName.includes(city.id)).map(city => city.id);
  assert.deepEqual(found, [...byName, ...rest(['KOR', 'SGP', 'ESP']), ...rest(['USA'])]);
  // 'f' and 'y' find one city by name; France's cities follow San Francisco as country matches.
  assert.deepEqual(ids('f', 'en'), ['sanfrancisco', ...inCountry('FRA')]);
  assert.deepEqual(ids('y', 'en'), ['newyork']);
  // 'San Francisco' starts with "san"; nothing else does, and a later word match would sort after it.
  assert.equal(ids('san', 'en')[0], 'sanfrancisco');
});
const order = id => destinations.findIndex(city => city.id === id);

test('a city is also found by its name in the other language, after screen-language matches', () => {
  assert.deepEqual(ids('busan'), ['busan']);
  assert.deepEqual(ids('Tokyo'), ['tokyo']);
  assert.deepEqual(ids('부산', 'en'), ['busan']);
  assert.deepEqual(ids('붓', 'en'), ['busan'], 'a half-typed Korean name still matches on the English screen');
  // Only the given tiers are searched: one name function is the old screen-language-only search.
  assert.deepEqual(searchCities('busan', destinations, city => tFor(city.key, 'ko')), []);
  const cities = [{ id: 'a', ko: '가나', en: 'Seoulite' }, { id: 'b', ko: 'Seoul', en: 'x' }, { id: 'c', ko: 'New Seoul', en: 'y' }];
  assert.deepEqual(searchCities('seoul', cities, city => city.ko, city => city.en).map(city => city.id), ['b', 'c', 'a']);
});

test('a country name in either language lists that country\'s cities, after city-name matches', () => {
  assert.ok(inCountry('JPN').length > 1);
  assert.deepEqual(ids('일본'), inCountry('JPN'));
  assert.deepEqual(ids('일'), inCountry('JPN'), 'half-typed country');
  assert.deepEqual(ids('japan'), inCountry('JPN'));
  assert.deepEqual(ids('Japan', 'en'), inCountry('JPN'));
  assert.deepEqual(ids('일본', 'en'), inCountry('JPN'));
  assert.deepEqual(ids('kingdom', 'en'), inCountry('GBR'), 'any word of the country name');
  const cities = [{ id: 'a', name: '가', country: '서울나라' }, { id: 'b', name: '서울', country: '나' }];
  assert.deepEqual(searchCities('서울', cities, city => city.name, () => '', city => city.country).map(city => city.id), ['b', 'a']);
});

test('an empty or symbol-only query and an unknown city find nothing', () => {
  for (const query of ['', '   ', '!?', null, undefined, '평양', 'zz']) assert.deepEqual(ids(query), [], String(query));
});
