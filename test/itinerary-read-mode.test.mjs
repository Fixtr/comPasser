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

test('카드의 메모에는 개인 메모라는 글자 표시가 붙고 화면 낭독기에도 이어진다', () => {
  const editor = readFileSync(new URL('../src/domains/itinerary/ui/stop-note-editor.js', import.meta.url), 'utf8');
  assert.match(editor, /savedLabel\.className = 'stop-note-label';/);
  assert.match(editor, /savedLabel\.textContent = t\('stopNoteBtn'\);/);
  assert.match(editor, /saved\.setAttribute\('aria-labelledby', savedLabel\.id\);/);
  assert.match(editor, /savedLink\.setAttribute\('aria-describedby', savedLabel\.id\);/);
  assert.match(editor, /savedLabel\.hidden = !note\?\.text && !note\?\.url;/, '메모가 없으면 표시도 없다');
});

test('예약 링크는 44px 이상으로 눌린다', () => {
  assert.match(itineraryStyles, /\.stop-note-link \{[^}]*min-height: 44px;/);
});

test('메모 편집 창이 열린 카드는 저장된 메모를 한 번만 보여 준다', () => {
  assert.match(itineraryStyles, /\.schedule-card:has\(\.stop-note-editor\) :is\(\.stop-note-label, \.stop-note-text, \.stop-note-link\) \{ display: none; \}/);
});

test('메모를 못 읽으면 화면에 한 번만 알리고 다시 읽는 버튼을 둔다', () => {
  const editor = readFileSync(new URL('../src/domains/itinerary/ui/stop-note-editor.js', import.meta.url), 'utf8');
  assert.match(editor, /status\.className = 'stop-notes-status';\s*status\.setAttribute\('role', 'alert'\);/);
  // 내 일정을 보고 있을 때만 알린다.
  assert.match(editor, /source\?\.kind !== 'private' \|\| source\.id !== id \|\| source\.ownerId !== ownerId \|\| getCurrentUser\(\)\?\.uid !== ownerId\) return;/);
  // 메모 버튼이 있는 일정표 위에서만 보인다(공유·초안·오류 화면에는 남지 않는다).
  assert.match(itineraryStyles, /\.stop-notes-status:not\(:has\(~ #timeline-container \.stop-note-btn\)\) \{ display: none; \}/);
  const rule = itineraryStyles.match(/:host\(:not\(\[edit-mode\]\)\)[^{]*\{[^}]*\}/g)?.join('\n') || '';
  assert.ok(!rule.includes('.stop-notes-status'), '읽기 모드에서도 보인다');
  // 읽기는 일정마다 한 번이고, 다시 읽는 것은 여행자가 누른 버튼뿐이다.
  assert.equal(editor.match(/readPrivateStopNotes\(/g).length, 1);
  // 두 언어 사전에 모두 있어야 한다. t()는 없는 키를 그대로 돌려준다.
  const i18n = readFileSync(new URL('../src/utils/i18n.js', import.meta.url), 'utf8');
  assert.equal(i18n.match(/^\s*stopNotesLoadFailed: "/gm)?.length, 2);
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

// stop-note-editor.js의 읽기 상태를 가짜 화면으로 실제로 돌린다.
function notesHarness() {
  const source = readFileSync(new URL('../src/domains/itinerary/ui/stop-note-editor.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replace(/^export (?=function )/gm, '');
  const reads = [];
  let status = null;
  let created = 0;
  const element = () => ({
    dataset: {}, textContent: '', children: [], setAttribute() {}, addEventListener(type, fn) { this[type] = fn; },
    append(...nodes) { this.children.push(...nodes); }, get firstChild() { return this.children[0]; },
    remove() { status = null; }, dispatchEvent() {},
  });
  const view = {
    _stopNotes: null,
    state: { current: { source: { kind: 'private', id: 'trip', ownerId: 'me' } } },
    shadowRoot: {
      activeElement: null,
      querySelector: () => status,
      querySelectorAll: () => [],
      getElementById: () => ({ before(node) { status = node; created += 1; }, focus() {} }),
    },
  };
  const deps = {
    t: key => key, escapeHtml: text => text, getCurrentUser: () => ({ uid: 'me' }),
    readPrivateStopNote: null, writePrivateStopNote: null, normalizeStopNote: null, stopNoteKeys: null,
    MAX_RESERVATION_URL_LENGTH: 1, MAX_STOP_NOTE_LENGTH: 1,
    readPrivateStopNotes: () => { const read = Promise.withResolvers(); reads.push(read); return read.promise; },
    document: { createElement: element }, Event: class {},
  };
  const savedNotes = new Function(...Object.keys(deps), `${source}\nreturn savedNotes;`)(...Object.values(deps));
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const fail = async () => { savedNotes(view, 'trip', 'me').catch(() => {}); reads.at(-1).reject(new Error('offline')); await settle(); };
  return { view, reads, settle, fail, savedNotes, status: () => status, created: () => created };
}

test('다시 시도 중에 메모를 저장해도 안내가 불러오는 중에 멈추지 않는다', async () => {
  for (const outcome of ['resolve', 'reject']) {
    const h = notesHarness();
    await h.fail();
    h.status().children[1].click();
    assert.equal(h.status().firstChild.textContent, 'stopNoteLoading');
    h.view._stopNotes = null; // 카드에서 메모를 저장하면 캐시를 비운다
    h.reads.at(-1)[outcome](outcome === 'resolve' ? {} : new Error('offline'));
    await h.settle();
    if (outcome === 'resolve') assert.equal(h.status(), null, '읽기가 성공하면 안내가 사라진다');
    else assert.equal(h.status().firstChild.textContent, 'stopNotesLoadFailed');
  }
});

test('읽기가 계속 실패해도 안내는 한 번만 만들어지고 글자도 다시 쓰지 않는다', async () => {
  const h = notesHarness();
  await h.fail();
  const first = h.status();
  let writes = 0;
  const span = first.firstChild;
  let text = span.textContent;
  Object.defineProperty(span, 'textContent', { get: () => text, set(value) { text = value; writes += 1; } });
  await h.fail(); // 날짜·언어 전환 등으로 다시 그릴 때의 재읽기
  assert.equal(h.status(), first);
  assert.equal(h.created(), 1);
  assert.equal(writes, 0, '같은 글자를 다시 쓰면 화면 낭독기가 또 읽는다');
  h.savedNotes(h.view, 'other', 'me').catch(() => {});
  assert.equal(h.status(), null, '다른 일정의 안내는 남기지 않는다');
});
