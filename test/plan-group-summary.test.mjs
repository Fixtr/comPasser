import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../src/utils/i18n.js';
import { planGroupSummaries } from '../src/domains/planner/services/plan-group-summary.mjs';

const draft = (over = {}) => ({
  date: ['2026-11-28'], startTime: '09:00', endTime: '20:00', dailyTimes: null, dailyLocations: null,
  startLocation: { displayName: '부산역' }, endLocation: '해운대',
  overnightLocations: [], flights: { arrival: null, departure: null }, anchorSchedules: [],
  ...over,
});

test('a filled one-day draft reads as one short line per group', () => {
  setLang('ko');
  assert.deepEqual(planGroupSummaries(draft({
    anchorSchedules: [
      { day: 1, name: '해변열차', time: '11:00', endTime: '12:00' },
      { day: 1, name: '감천문화마을', flexible: true },
      { day: 1, name: '태종대', flexible: true },
      { day: 1, name: '', time: '15:00', endTime: '16:00' },
    ],
  })), {
    time: '09:00 – 20:00',
    endpoints: '부산역 → 해운대',
    stays: '',
    flights: '',
    places: ['1일차 · 11:00 – 12:00 · 해변열차', '1일차 · 15:00 – 16:00 · 장소 미정', '방문 시간 자동 배치 2곳'],
  });
});

test('missing values say so, and per-day settings are flagged instead of listed', () => {
  setLang('ko');
  const summary = planGroupSummaries(draft({
    date: ['2026-11-28', '2026-11-29'], startTime: '', startLocation: '', endLocation: null,
    dailyTimes: [{ day: 1, startTime: '09:00', endTime: '20:00', isCustom: true }],
    dailyLocations: [{ day: 1, startLocation: '', endLocation: '' }, { day: 2, startLocation: '서면', endLocation: '' }],
  }));
  assert.equal(summary.time, '일자별 설정');
  assert.equal(summary.endpoints, '장소 미정 → 장소 미정 · 일자별 설정');
  assert.equal(planGroupSummaries(draft({ startTime: '' })).time, '시간 미입력 – 20:00');
});

test('stays, flights and English text', () => {
  setLang('en');
  try {
    const summary = planGroupSummaries(draft({
      date: ['2026-11-28', '2026-11-29', '2026-11-30'],
      overnightLocations: [{ displayName: 'Hotel A' }, ''],
      stays: [{ location: 'Hotel A', checkin: '2026-11-28', checkout: '2026-11-29' }, { location: { displayName: 'Hotel B' } }],
      flights: { arrival: { airport: 'PUS', time: '08:10' }, departure: { airport: 'PUS', time: '' } },
      anchorSchedules: [{ day: 2, name: 'Yacht', time: '14:00', endTime: '' }],
    }));
    assert.equal(summary.stays, 'Hotel A · Hotel B');
    assert.equal(summary.flights, 'Arriving flight 08:10 · Departing flight Time not set');
    assert.deepEqual(summary.places, ['Day 2 · 14:00 – Time not set · Yacht']);
    // Without the newer stays list, the nightly locations are the stays.
    assert.equal(planGroupSummaries(draft({ overnightLocations: ['Hotel A', ''] })).stays, 'Hotel A');
  } finally { setLang('ko'); }
});
