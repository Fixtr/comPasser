import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCities } from '../src/domains/planner/services/city-search.mjs';
import { destinations } from '../src/domains/planner/services/travel-destinations.mjs';
import { tFor } from '../src/utils/i18n.js';

const ids = (query, lang = 'ko') => searchCities(query, destinations, city => tFor(city.key, lang)).map(city => city.id);

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
  const found = ids('s', 'en');
  assert.ok(found.length > 1);
  assert.deepEqual(found, [...found].sort((a, b) => order(a) - order(b)));
  assert.deepEqual(ids('f', 'en'), ['sanfrancisco']);
  assert.deepEqual(ids('y', 'en'), ['newyork']);
  // 'San Francisco' starts with "san"; nothing else does, and a later word match would sort after it.
  assert.equal(ids('san', 'en')[0], 'sanfrancisco');
});
const order = id => destinations.findIndex(city => city.id === id);

test('only the names of the given language are searched', () => {
  assert.deepEqual(ids('busan'), []);
  assert.deepEqual(ids('부산', 'en'), []);
});

test('an empty or symbol-only query and an unknown city find nothing', () => {
  for (const query of ['', '   ', '!?', null, undefined, '평양', 'zz']) assert.deepEqual(ids(query), [], String(query));
});
