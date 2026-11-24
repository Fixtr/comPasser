import test from 'node:test';
import assert from 'node:assert/strict';
import { readItineraryViewSource } from './helpers/itinerary-view-sources.mjs';
import { itineraryStyles } from '../src/domains/itinerary/ui/itinerary-style.js';

const source = readItineraryViewSource();

test('읽기 모드는 편집 버튼 6개와 끼워 넣기 자리를 CSS로만 숨긴다', () => {
  const rule = itineraryStyles.match(/:host\(:not\(\[edit-mode\]\)\)[^{]*\{[^}]*\}/g)?.join('\n') || '';
  for (const selector of ['.item-edit-actions', '.visit-time-btn', '.replace-place-btn', '.indoor-alternatives-btn', '.insert-slot']) {
    assert.ok(rule.includes(selector), `${selector} 는 읽기 모드에서 숨긴다`);
  }
  assert.match(rule, /display:\s*none/);
});

test('비 알림이 떠 있으면 읽기 모드에서도 실내 대안 찾기가 보인다', () => {
  assert.match(itineraryStyles, /\.rain-banner ~ #timeline-container \.schedule-card:not\(\[data-visited\]\) \.indoor-alternatives-btn\s*\{\s*display:\s*inline-block/);
});

test('편집 토글은 눌림 상태를 가진 실제 버튼이고 기본은 꺼져 있다', () => {
  assert.match(source, /<button type="button" id="edit-mode-btn"[^>]*aria-pressed="false"[^>]*hidden>/);
  assert.match(source, /editMode\.hidden = !hasPlan \|\| !this\.canEdit\(\)/);
  assert.match(source, /let editModeOn = false;/);
});

test('상세 정보는 접힌 details 안에 들어간다', () => {
  assert.match(source, /<details class="schedule-details">\s*<summary data-i18n="scheduleDetails">/);
  assert.doesNotMatch(source, /<details[^>]*\sopen/);
});

test('편집을 켠 일정이 아닌 다른 일정이 열리면 읽기 모드로 돌아간다', () => {
  assert.match(source, /editModeTrip = \{ plan: this\.currentItinerary \}/);
  assert.match(source, /if \(entry\.plan === editModeTrip\?\.plan \|\| \(id && id === editModeTrip\?\.id\)\) editModeTrip = \{ plan: entry\.plan, id \};\s*else editModeOn = false;/);
});
