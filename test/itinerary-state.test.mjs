import test from 'node:test';
import assert from 'node:assert/strict';
import { createItineraryState, ITINERARY_SESSION_KEY } from '../src/domains/itinerary/services/itinerary-state.mjs';

const plan = () => ({ request: { endTime: '20:00' }, days: [
  { day: 1, date: '2026-09-08', scheduleItems: [{ title: '출발', time: '09:00' }] },
  { day: 2, date: '2026-09-09', scheduleItems: [{ title: '방문지', time: '10:00' }] },
] });
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const make = (storage, user = 'owner') => {
  const state = createItineraryState({ getStorage: () => storage });
  state.setUser(user);
  return state;
};

test('편집·장소 확인·선택 날짜는 하나의 최신 상태와 복원 사본에 반영된다', () => {
  const storage = memoryStorage(), state = make(storage);
  state.open(plan());
  state.selectDay(1);
  state.replaceDayItems(1, [{ title: '추가한 장소', time: '21:30' }]);
  state.resolvePlaces(1, [{ index: 0, name: '확인된 이름', address: '주소' }]);
  const fresh = make(storage);
  const restored = fresh.activateDraft();
  assert.equal(restored.dayIndex, 1);
  assert.deepEqual(restored.plan, state.current.plan);
  assert.equal(restored.plan.days[1].scheduleItems[0].time, '21:30', '복원 과정에서 종료 시각에 맞춰 다시 잘라내지 않는다');
  assert.notEqual(restored.plan, state.current.plan);
});

test('초안·개인 일정·공유본을 번갈아 열어도 각각의 데이터와 선택 날짜가 유지된다', () => {
  const state = make(memoryStorage());
  const draft = state.open(plan());
  state.selectDay(1);
  const privateEntry = state.open(plan(), { kind: 'private', id: 'trip' });
  state.replaceDayItems(0, [{ title: '개인 일정 편집', time: '12:00' }]);
  state.open(plan(), { kind: 'shared', id: 'trip' });
  assert.equal(state.activateDraft(), draft);
  assert.equal(state.current.dayIndex, 1);
  assert.equal(state.activateDocument('trip', { userId: 'owner' }), privateEntry);
  assert.equal(state.current.plan.days[0].scheduleItems[0].title, '개인 일정 편집');
  assert.equal(state.activateDocument('trip', { sharedOnly: true }).source.kind, 'shared');
});

test('개인 일정의 로컬 편집도 같은 계정에서 새로고침하면 복원된다', () => {
  const storage = memoryStorage(), state = make(storage);
  state.open(plan(), { kind: 'private', id: 'trip' });
  state.replaceDayItems(0, [{ title: '수정함' }]);
  assert.equal(make(storage).activateDocument('trip', { userId: 'owner' }).plan.days[0].scheduleItems[0].title, '수정함');
});

test('개인 일정은 편집했을 때만 저장할 변경이 있다고 표시하고, 저장 표시는 수정 이력을 지우지 않는다', () => {
  const storage = memoryStorage(), state = make(storage);
  state.open(plan(), { kind: 'private', id: 'trip' });
  state.selectDay(1);
  state.resolvePlaces(1, [{ index: 0, name: '확인된 이름', address: '주소' }]);
  assert.ok(!state.current.unsaved, '열기·날짜 선택·장소 확인은 편집이 아니다');
  state.replaceDayItems(0, [{ title: '시간 수정', time: '12:00' }]);
  assert.equal(state.current.unsaved, true);
  assert.equal(make(storage).activateDocument('trip', { userId: 'owner' }).unsaved, true, '새로고침해도 남는다');
  state.editDayItems(1, [], { undo: true });
  state.markSaved();
  assert.ok(!state.current.unsaved);
  assert.deepEqual(state.current.dirtyDays, [1]);
  assert.ok(state.current.undoByDay[1]);
  assert.ok(!make(storage).activateDocument('trip', { userId: 'owner' }).unsaved);
});

test('저장 표시가 생기기 전에 편집한 개인 일정은 복원할 때 저장할 변경으로 본다', () => {
  const storage = memoryStorage();
  const entry = (id, edited) => ({ source: { kind: 'private', id, ownerId: 'owner' }, plan: plan(), dayIndex: 0,
    dirtyDays: edited ? [0] : [], undoByDay: {} });
  storage.setItem(ITINERARY_SESSION_KEY, JSON.stringify({ version: 1, userId: 'owner', entries: [entry('edited', true), entry('opened', false)] }));
  const state = make(storage);
  assert.equal(state.activateDocument('edited', { userId: 'owner' }).unsaved, true);
  assert.ok(!state.activateDocument('opened', { userId: 'owner' }).unsaved);
});

test('게스트와 다른 계정은 개인 캐시를 복원하지 못하고 계정 전환은 이전 사본을 비운다', () => {
  const storage = memoryStorage(), state = make(storage);
  state.open(plan(), { kind: 'private', id: 'trip' });
  state.open(plan());
  assert.equal(state.activateDocument('trip'), null);
  assert.equal(state.activateDocument('trip', { userId: 'other' }), null);
  const other = make(storage, 'other');
  assert.equal(other.activateDraft(), null);
  assert.equal(other.activateDocument('trip', { userId: 'other' }), null);
  state.setUser('other');
  assert.equal(state.current, null);
  assert.equal(state.activateDraft(), null);
});

test('로그아웃은 개인 사본을 비우지만 현재 공개 공유본은 계속 읽을 수 있다', () => {
  const storage = memoryStorage(), state = make(storage);
  state.open(plan());
  const shared = state.open(plan(), { kind: 'shared', id: 'public' });
  state.setUser(null);
  assert.equal(storage.getItem(ITINERARY_SESSION_KEY), null);
  assert.equal(state.current, shared);
  assert.equal(state.activateDraft(), null);
});

test('공유본은 개인 초안을 덮지 않고 공유 내용은 임시 저장소에 기록하지 않는다', () => {
  const storage = memoryStorage(), state = make(storage);
  state.open(plan());
  const sharedPlan = plan();
  sharedPlan.days[0].scheduleItems[0].title = '공유본만의 내용';
  state.open(sharedPlan, { kind: 'shared', id: 'public' });
  state.resolvePlaces(0, [{ index: 0, name: '공유 장소', address: '주소' }]);
  const saved = JSON.parse(storage.getItem(ITINERARY_SESSION_KEY));
  assert.equal(saved.entries.length, 1);
  assert.equal(saved.entries[0].source.kind, 'draft');
  assert.equal(storage.getItem(ITINERARY_SESSION_KEY).includes('공유본만의 내용'), false);
});

test('이전 savedItineraryData는 로그인된 탭에서 최신 형식으로 한 번만 이전한다', () => {
  const storage = memoryStorage();
  storage.setItem('savedItineraryData', JSON.stringify(plan()));
  const state = make(storage);
  assert.deepEqual(state.activateDraft().plan, plan());
  assert.equal(storage.getItem('savedItineraryData'), null);
  assert.equal(JSON.parse(storage.getItem(ITINERARY_SESSION_KEY)).userId, 'owner');
});

test('임시 저장 실패는 메모리 편집을 막지 않고 이전 형식도 지우지 않는다', () => {
  const values = memoryStorage();
  values.setItem('savedItineraryData', JSON.stringify(plan()));
  let warnings = 0;
  const state = createItineraryState({
    getStorage: () => ({ ...values, setItem() { throw new Error('quota'); } }),
    onStorageError: () => warnings++,
  });
  state.setUser('owner');
  state.activateDraft();
  state.replaceDayItems(0, [{ title: '수정됨' }]);
  state.selectDay(1);
  assert.equal(state.current.plan.days[0].scheduleItems[0].title, '수정됨');
  assert.equal(warnings, 1);
  assert.notEqual(values.getItem('savedItineraryData'), null);
});

test('파손된 JSON, 잘못된 일정과 선택 날짜는 안전하게 처리한다', () => {
  const storage = memoryStorage();
  storage.setItem(ITINERARY_SESSION_KEY, '{broken');
  assert.equal(make(storage).activateDraft(), null);
  const state = make(storage);
  assert.equal(state.open({ days: [] }), null);
  assert.equal(state.open({ days: [null] }), null);
  state.open(plan());
  assert.equal(state.selectDay(99), false);
  assert.equal(state.current.dayIndex, 0);
});

test('저장/공유용 스냅샷은 이후 편집과 분리되며 화면 전환도 리비전을 바꾼다', () => {
  const state = make(memoryStorage());
  state.open(plan());
  const snapshot = state.snapshot();
  state.replaceDayItems(0, [{ title: '이후 편집' }]);
  assert.equal(snapshot.plan.days[0].scheduleItems[0].title, '출발');
  state.open(plan(), { kind: 'shared', id: 'public' });
  const before = state.revision;
  state.activateDraft();
  assert.ok(state.revision > before);
});

test('삭제한 개인 일정은 캐시와 복원 사본에서 빠지며 공유본은 유지한다', () => {
  const storage = memoryStorage(), state = make(storage);
  state.open(plan(), { kind: 'private', id: 'trip' });
  const shared = state.open(plan(), { kind: 'shared', id: 'trip' });
  state.forgetDocument('trip');
  assert.equal(state.current, shared);
  assert.equal(state.activateDocument('trip', { userId: 'owner' }), null);
  assert.equal(make(storage).activateDocument('trip', { userId: 'owner' }), null);
});

test('개인 일정 일괄 삭제는 모든 문서 캐시만 제거하고 초안과 공유본은 건드리지 않는다', () => {
  const state = make(memoryStorage());
  state.open(plan());
  state.open(plan(), { kind: 'private', id: 'one' });
  state.open(plan(), { kind: 'private', id: 'two' });
  state.open(plan(), { kind: 'shared', id: 'public' });
  state.forgetDocument(null);
  assert.equal(state.activateDocument('one', { userId: 'owner' }), null);
  assert.equal(state.activateDocument('two', { userId: 'owner' }), null);
  assert.notEqual(state.activateDraft(), null);
  assert.notEqual(state.activateDocument('public', { sharedOnly: true }), null);
});
