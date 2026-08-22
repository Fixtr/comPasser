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

/**
 * 아래는 다국어(ko/en) 사용 중에 나온 오탐을 막기 위한 것이다.
 *
 * Places 요청 언어가 'ko' 로 고정돼 있던 동안, 영어 모드에서는 AI 가 쓴
 * "Gyeongbokgung Palace" 와 지도가 돌려준 "경복궁" 이 맞붙었다. 둘은 같은
 * 곳인데 글자가 하나도 겹치지 않으니 거의 모든 항목에 "다른 곳을 찾았다"
 * 경고가 붙었다. 언어를 맞추는 것이 근본 해결이지만, 언어를 도중에 바꾸면
 * 이미 로드된 지도는 그대로이므로 표기 체계가 어긋나는 순간이 남는다.
 *
 * 그래서 규칙을 하나 둔다 — 한글과 로마자처럼 문자 체계가 아예 다르면
 * "틀렸다" 가 아니라 "비교할 수 없다" 로 본다. 찾은 곳은 그대로 보여주되
 * 경고는 붙이지 않는다.
 */
test('문자 체계가 다르면 오매칭으로 단정하지 않는다', () => {
  assert.equal(isResolvedNameMatching('Gyeongbokgung Palace', '경복궁'), true);
  assert.equal(isResolvedNameMatching('경복궁', 'Gyeongbokgung Palace'), true);
  assert.equal(isResolvedNameMatching('Gwangjang Market', '광장시장'), true);
});

test('문자 체계가 달라도 지도가 찾은 곳은 그대로 보여준다', () => {
  const result = describeResolvedPlace({
    written: 'Gyeongbokgung Palace',
    name: '경복궁',
    address: '서울특별시 종로구 사직로 161',
  });
  assert.equal(result.visible, true, '찾은 곳은 숨기지 않는다');
  assert.equal(result.mismatch, false, '비교 불가를 오매칭으로 표시하면 안 된다');
  assert.equal(result.detail, '경복궁 · 서울특별시 종로구 사직로 161');
});

test('같은 문자 체계 안에서는 오매칭을 계속 잡는다', () => {
  // 이 규칙이 진짜 오매칭까지 덮어버리면 안 된다.
  assert.equal(isResolvedNameMatching('경복궁', '스타벅스 광화문점'), false);
  assert.equal(isResolvedNameMatching('Gyeongbokgung Palace', 'Starbucks Gwanghwamun'), false);
});

test('한글과 숫자·기호만 섞인 이름은 같은 체계로 본다', () => {
  // "63빌딩" 처럼 숫자가 섞여도 한글 표기이므로 비교 대상이다.
  assert.equal(isResolvedNameMatching('63빌딩', '스타벅스 여의도점'), false);
});

test('영어로 적힌 곳의 한글 이름은 주소가 없어도 보여준다', () => {
  // 외국인 사용자에게 한글 상호는 택시 기사에게 보여줄 수 있는 실질적인 값이다.
  const result = describeResolvedPlace({
    written: 'Gwangjang Market',
    name: '광장시장',
    address: '',
  });
  assert.equal(result.visible, true);
  assert.equal(result.mismatch, false);
  assert.equal(result.detail, '광장시장');
});
