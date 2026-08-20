import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePlaceName,
  isResolvedNameMatching,
  describeResolvedPlace,
} from '../src/domains/itinerary/services/itinerary-resolved-place.mjs';

test('표기 차이는 무시하고 비교한다', () => {
  assert.equal(normalizePlaceName(' 아이파크몰 (용산점) '), '아이파크몰용산점');
  assert.equal(normalizePlaceName('N-Seoul_Tower'), 'nseoultower');
  assert.equal(normalizePlaceName(null), '');
});

test('한쪽이 다른 쪽을 품으면 같은 곳으로 본다', () => {
  assert.equal(isResolvedNameMatching('서울 경복궁', '경복궁'), true);
  assert.equal(isResolvedNameMatching('경복궁', '경복궁 (서울)'), true);
  assert.equal(isResolvedNameMatching('용산 아이파크몰', '아이파크몰 용산점'), false);
});

test('찾아낸 이름이 없으면 경고하지 않는다', () => {
  assert.equal(isResolvedNameMatching('경복궁', ''), true);
  assert.equal(isResolvedNameMatching('경복궁', null), true);
});

test('전혀 다른 곳이 잡히면 불일치로 표시한다', () => {
  const result = describeResolvedPlace({
    written: '존재하지않는장소xyz123',
    name: '이혼·상속 전문로펌 법무법인 존재',
    address: '서울 서초구 서초대로 356',
  });
  assert.equal(result.visible, true);
  assert.equal(result.mismatch, true);
  assert.equal(result.detail, '이혼·상속 전문로펌 법무법인 존재 · 서울 서초구 서초대로 356');
});

test('같은 곳이어도 주소는 알려준다', () => {
  const result = describeResolvedPlace({
    written: '서울 경복궁',
    name: '경복궁',
    address: '서울특별시 종로구 사직로 161',
  });
  assert.equal(result.visible, true);
  assert.equal(result.mismatch, false);
  assert.equal(result.detail, '경복궁 · 서울특별시 종로구 사직로 161');
});

test('같은 곳이고 주소도 없으면 줄을 띄우지 않는다', () => {
  const result = describeResolvedPlace({ written: '경복궁', name: '경복궁', address: '' });
  assert.equal(result.visible, false);
  assert.equal(result.detail, '');
});

test('지도가 아무것도 못 돌려주면 줄을 띄우지 않는다', () => {
  assert.equal(describeResolvedPlace({ written: '경복궁' }).visible, false);
  assert.equal(describeResolvedPlace({}).visible, false);
  assert.equal(describeResolvedPlace().visible, false);
});

test('주소만 있으면 주소만 보여준다', () => {
  const result = describeResolvedPlace({ written: '경복궁', name: '', address: '서울 종로구' });
  assert.equal(result.visible, true);
  assert.equal(result.mismatch, false);
  assert.equal(result.detail, '서울 종로구');
});
