import test from 'node:test';
import assert from 'node:assert/strict';
import { readItineraryViewSource } from './helpers/itinerary-view-sources.mjs';
import { readFileSync } from 'node:fs';
import { itineraryStyles } from '../src/domains/itinerary/ui/itinerary-style.js';

const source = readItineraryViewSource();

test('읽기 모드는 편집 버튼 6개와 끼워 넣기 자리를 CSS로만 숨긴다', () => {
  const rule = itineraryStyles.match(/:host\(:not\(\[edit-mode\]\)\)[^{]*\{[^}]*\}/g)?.join('\n') || '';
  for (const selector of ['.item-edit-actions', '.visit-time-btn', '.replace-place-btn', '.indoor-alternatives-btn', '.insert-slot']) {
    assert.ok(rule.includes(selector), `${selector} 는 읽기 모드에서 숨긴다`);
  }
  assert.match(rule, /display:\s*none/);
});

test('읽기 모드는 메모 추가·수정, 다시 조정, 동선 개선, 되돌리기도 CSS로만 숨기고 나머지는 남긴다', () => {
  const rule = itineraryStyles.match(/:host\(:not\(\[edit-mode\]\)\)[^{]*\{[^}]*\}/g)?.join('\n') || '';
  for (const selector of ['.stop-note-btn', '#recalculate-times-btn', '#improve-route-btn', '#undo-deletion-btn']) {
    assert.ok(rule.includes(selector), `${selector} 는 읽기 모드에서 숨긴다`);
  }
  for (const kept of ['#replan-trip-btn', '#edit-mode-btn', '#day-modified', '.nav-btn', '.visited-btn', '.action-links', '.stop-note-text', '.stop-note-link', '.end-time-warning']) {
    assert.ok(!rule.includes(kept), `${kept} 는 읽기 모드에서도 보인다`);
  }
  // 버튼과 연결은 그대로 있다.
  for (const id of ['recalculate-times-btn', 'improve-route-btn', 'undo-deletion-btn']) {
    assert.match(source, new RegExp(`<button[^>]*id="${id}"`));
    assert.match(source, new RegExp(`getElementById\\('${id}'\\)\\?\\.addEventListener\\('click'`));
  }
});

test('자동으로 방문을 뺀 안내가 되돌리기를 가리키는 동안에는 읽기 모드에서도 되돌리기가 보인다', () => {
  assert.match(itineraryStyles, /:host\(:not\(\[edit-mode\]\)\) :is\([^)]*#undo-deletion-btn:not\(\[data-pointed\]\)\) \{ display: none; \}/);
  assert.match(source, /t\(removed \? 'endTimeVisitRemoved' : 'endTimeAutoFit'\)[^\n]*\n[^\n]*\n\s*const undo = removed && view\.shadowRoot\.getElementById\('undo-deletion-btn'\);\s*if \(undo\) undo\.dataset\.pointed = view\.activeDayIndex;/);
  // 다른 날짜로 가거나 되돌릴 것이 없어지면 예외도 끝난다.
  assert.match(source, /if\(undo\.hidden\|\|undo\.dataset\.pointed!==String\(this\.activeDayIndex\)\)delete undo\.dataset\.pointed;/);
  // 편집을 켰다 끄면 그 안내와 상관없는 새 되돌리기일 수 있으므로 예외를 끝낸다.
  assert.match(source, /getElementById\('edit-mode-btn'\)\?\.addEventListener\('click', \(\) => \{[\s\S]{0,400}?delete this\.shadowRoot\.getElementById\('undo-deletion-btn'\)\?\.dataset\.pointed;/);
});

test('저장된 메모 글은 버튼과 따로 카드에 보여서 읽기 모드에서도 읽힌다', () => {
  const editor = readFileSync(new URL('../src/domains/itinerary/ui/stop-note-editor.js', import.meta.url), 'utf8');
  assert.match(editor, /saved\.className = 'stop-note-text';/);
  assert.match(editor, /saved\.textContent = note\?\.text \|\| '';/, '메모는 글자로만 넣는다');
  assert.match(editor, /card\.append\(saved, savedLink, button\);/);
  // 늦게 도착한 첫 읽기가 방금 저장한 글을 덮어쓰지 않는다.
  assert.match(editor, /if \(!savedHere && sameTrip\(\)\) showSaved\(normalizeStopNote/);
  assert.match(editor, /savedHere = true;\s*view\._stopNotes = null;/);
  assert.match(itineraryStyles, /\.stop-note-text\[hidden\], \.stop-note-link\[hidden\] \{ display: none; \}/);
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
