import test from 'node:test';
import assert from 'node:assert/strict';
import { createItineraryActions } from '../src/domains/itinerary/services/itinerary-actions.mjs';
import { createItineraryState } from '../src/domains/itinerary/services/itinerary-state.mjs';

const plan = () => ({ days: [
  { day: 1, date: '2026-09-08', scheduleItems: [{ title: '경복궁', time: '09:00' }] },
  { day: 2, date: '2026-09-09', scheduleItems: [{ title: '서울숲', time: '10:00' }] },
] });

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture({ user = { uid: 'owner' }, save, share, update } = {}) {
  const session = { user };
  const state = createItineraryState();
  state.setUser(user?.uid);
  const calls = { saves: [], shares: [], urls: [] };
  const updates = [];
  const actions = createItineraryActions({
    state,
    getCurrentUser: () => session.user,
    saveItinerary: async (...args) => {
      calls.saves.push(args);
      return save ? save(...args) : 'saved123';
    },
    updateItinerary: async (...args) => {
      updates.push(args);
      return update ? update(...args) : args[0];
    },
    createSharedItinerary: async (snapshot, sourceId) => {
      assert.equal(sourceId, state.current.source.id);
      calls.shares.push(snapshot);
      return share ? share(snapshot) : 'published123';
    },
    getSharedItineraryUrl: id => {
      calls.urls.push(id);
      return `https://app.example/share/${id}`;
    },
  });
  return { state, session, calls, updates, actions };
}

test('저장은 최신 일정의 사본과 제목을 전달하고 선택 날짜를 유지한 뒤 UI에 알린다', async () => {
  const { state, calls, actions } = fixture();
  const original = plan();
  state.open(original);
  state.selectDay(1);
  const notifications = [];

  const result = await actions.save({ onSaved(id) {
    notifications.push(id);
    assert.deepEqual(state.current.source, { kind: 'private', id: 'saved123', ownerId: 'owner' });
    assert.equal(state.current.dayIndex, 1);
  } });

  assert.deepEqual(result, { status: 'saved', id: 'saved123' });
  assert.deepEqual(calls.saves, [['owner', original, '9월 8일~9월 9일 · 1박 2일']]);
  assert.notEqual(calls.saves[0][1], original);
  assert.deepEqual(notifications, ['saved123']);
});

test('저장한 개인 일정은 같은 문서를 고치고 새 문서를 만들지 않는다', async () => {
  const { state, calls, updates, actions } = fixture();
  const entry = state.open(plan(), { kind: 'private', id: 'mine123' });
  state.selectDay(1);
  state.editDayItems(0, [{ title: '덕수궁', time: '11:00' }], { undo: true });
  const notifications = [];

  assert.deepEqual(await actions.save({ onSaved: id => notifications.push(id) }), { status: 'saved', id: 'mine123' });
  assert.deepEqual(calls.saves, []);
  assert.equal(updates.length, 1);
  assert.equal(updates[0][0], 'mine123');
  assert.equal(updates[0][1].days[0].scheduleItems[0].title, '덕수궁');
  assert.notEqual(updates[0][1], entry.plan);
  assert.equal(state.current, entry);
  assert.ok(!entry.unsaved);
  assert.deepEqual(entry.dirtyDays, [0], '시간 재계산 표시는 저장으로 지우지 않는다');
  assert.equal(entry.dayIndex, 1);
  assert.deepEqual(notifications, ['mine123']);

  await actions.save();
  assert.equal(updates.length, 2);
  assert.deepEqual(calls.saves, []);
});

test('다른 기기에서 지운 개인 일정의 편집은 새 일정으로 저장한다', async () => {
  const gone = Object.assign(new Error('missing'), { code: 'permission-denied' });
  const { state, calls, actions } = fixture({ update: async () => { throw gone; } });
  state.open(plan(), { kind: 'private', id: 'deleted123' });
  state.replaceDayItems(0, [{ title: '지우기 전 편집' }]);

  assert.deepEqual(await actions.save(), { status: 'saved', id: 'saved123' });
  assert.equal(calls.saves.length, 1);
  assert.equal(calls.saves[0][1].days[0].scheduleItems[0].title, '지우기 전 편집');
  assert.deepEqual(state.current.source, { kind: 'private', id: 'saved123', ownerId: 'owner' });

  // Another account's cached trip is never copied into the signed-in account.
  const other = fixture({ user: { uid: 'other' }, update: async () => { throw gone; } });
  other.state.open(plan(), { kind: 'private', id: 'foreign' });
  other.state.current.source.ownerId = 'owner';
  await assert.rejects(other.actions.save(), error => error === gone);
  assert.deepEqual(other.calls.saves, []);
});

test('개인 일정 저장 중 다시 편집하면 저장할 변경이 남는다', async () => {
  const write = deferred();
  const { state, actions } = fixture({ update: () => write.promise });
  state.open(plan(), { kind: 'private', id: 'mine123' });
  state.replaceDayItems(0, [{ title: '첫 편집' }]);
  let notifications = 0;
  const saving = actions.save({ onSaved: () => notifications++ });
  state.replaceDayItems(0, [{ title: '저장 중 편집' }]);
  write.resolve('mine123');

  assert.deepEqual(await saving, { status: 'saved-earlier-version', id: 'mine123' });
  assert.equal(state.current.unsaved, true);
  assert.equal(notifications, 0);
});

test('공유본 저장은 공개 원본을 수정하지 않고 로그인 계정의 개인 사본을 연다', async () => {
  const { state, calls, actions } = fixture();
  const original = plan();
  const shared = state.open(original, { kind: 'shared', id: 'public123' });
  state.selectDay(1);

  assert.deepEqual(await actions.save({ language: 'en' }), { status: 'saved', id: 'saved123' });
  assert.equal(calls.saves[0][2], '09/08–09/09 · 2 days');
  assert.equal(state.current.source.kind, 'private');
  assert.equal(state.current.dayIndex, 1);
  assert.notEqual(state.current.plan, original);
  assert.equal(state.activateDocument('public123', { sharedOnly: true }), shared);
  assert.equal(shared.plan, original);
  assert.deepEqual(original, plan());
});

test('저장 중 편집한 최신 일정은 저장 시작 시점의 사본으로 덮거나 이동시키지 않는다', async () => {
  const pending = deferred();
  const { state, calls, actions } = fixture({ save: () => pending.promise });
  const original = plan();
  state.open(original);
  let notifications = 0;
  const saving = actions.save({ onSaved: () => notifications++ });
  state.replaceDayItems(0, [{ title: '편집한 장소', time: '11:00' }]);
  pending.resolve('oldSnapshot123');

  assert.deepEqual(await saving, { status: 'saved-earlier-version', id: 'oldSnapshot123' });
  assert.equal(calls.saves[0][1].days[0].scheduleItems[0].title, '경복궁');
  assert.equal(state.current.plan.days[0].scheduleItems[0].title, '편집한 장소');
  // The screen now shows the new trip with the later edit unsaved, so saving again updates it instead of creating a second trip.
  assert.deepEqual(state.current.source, { kind: 'private', id: 'oldSnapshot123', ownerId: 'owner' });
  assert.equal(state.current.unsaved, true);
  assert.equal(state.activateDraft(), null);
  assert.equal(notifications, 1);
  assert.deepEqual(await actions.save(), { status: 'saved', id: 'oldSnapshot123' });
  assert.equal(calls.saves.length, 1);
  assert.equal(state.current.unsaved, false);
});

test('저장 중 계정이 바뀌면 새 계정의 일정과 화면을 건드리지 않는다', async () => {
  const pending = deferred();
  const { state, session, calls, actions } = fixture({ save: () => pending.promise });
  state.open(plan());
  let notifications = 0;
  const saving = actions.save({ onSaved: () => notifications++ });
  session.user = { uid: 'other' };
  state.setUser('other');
  const other = state.open(plan());
  pending.resolve('previousAccount123');

  assert.deepEqual(await saving, { status: 'account-changed' });
  assert.equal(calls.saves[0][0], 'owner');
  assert.equal(state.current, other);
  assert.equal(state.current.source.ownerId, 'other');
  assert.equal(notifications, 0);
});

test('저장 중 다른 날만 고르면 그 일정이 저장본이 되고 고른 날을 유지한다', async () => {
  const pending = deferred();
  const { state, actions } = fixture({ save: () => pending.promise });
  state.open(plan());
  let notifications = 0;
  const saving = actions.save({ onSaved: () => notifications++ });
  state.selectDay(1);
  pending.resolve('saved123');

  assert.deepEqual(await saving, { status: 'saved', id: 'saved123' });
  assert.deepEqual(state.current.source, { kind: 'private', id: 'saved123', ownerId: 'owner' });
  assert.equal(state.current.dayIndex, 1);
  assert.equal(state.current.unsaved, false);
  assert.equal(notifications, 1);
});

test('저장 중 다른 일정으로 이동하면 완료 후 이전 화면으로 되돌리지 않는다', async () => {
  for (const move of ['document', 'leave']) {
    const pending = deferred();
    const { state, actions } = fixture({ save: () => pending.promise });
    state.open(plan());
    let notifications = 0;
    const saving = actions.save({ onSaved: () => notifications++ });
    if (move === 'document') state.open(plan(), { kind: 'private', id: 'other123' });
    else state.deactivate();
    const active = state.current;
    const before = state.snapshot();
    pending.resolve('saved123');

    assert.deepEqual(await saving, { status: 'saved-earlier-version', id: 'saved123' }, move);
    assert.equal(state.current, active, move);
    assert.deepEqual(state.snapshot(), before, move);
    assert.equal(notifications, 0, move);
  }
});

test('일정이 없거나 대체 예시 일정이면 저장과 공유 확인·쓰기를 실행하지 않는다', async () => {
  for (const fallback of [false, true]) {
    const { state, calls, actions } = fixture();
    if (fallback) state.open({ ...plan(), isFallback: true });
    let confirms = 0;
    assert.deepEqual(await actions.save(), { status: 'unavailable' });
    assert.deepEqual(await actions.getShareLink({ confirmPublicShare: () => { confirms++; return true; } }), { status: 'unavailable' });
    assert.deepEqual(calls, { saves: [], shares: [], urls: [] });
    assert.equal(confirms, 0);
  }
});

test('비로그인 사용자의 저장과 개인 초안 공개는 로그인 요구만 반환한다', async () => {
  const { state, calls, actions } = fixture({ user: null });
  state.open(plan());
  let confirms = 0;
  assert.deepEqual(await actions.save(), { status: 'login-required' });
  assert.deepEqual(await actions.getShareLink({ confirmPublicShare: () => { confirms++; return true; } }), { status: 'login-required' });
  assert.deepEqual(calls, { saves: [], shares: [], urls: [] });
  assert.equal(confirms, 0);
});

test('공개 공유본의 링크는 비로그인도 확인이나 새 문서 생성 없이 재사용한다', async () => {
  const { state, calls, actions } = fixture({ user: null });
  state.open(plan(), { kind: 'shared', id: 'public123' });
  const before = state.snapshot();
  let confirms = 0;

  assert.deepEqual(await actions.getShareLink({ confirmPublicShare: () => { confirms++; return true; } }), {
    status: 'ready', url: 'https://app.example/share/public123',
  });
  assert.deepEqual(await actions.save(), { status: 'login-required' });
  assert.deepEqual(state.snapshot(), before);
  assert.deepEqual(calls, { saves: [], shares: [], urls: ['public123'] });
  assert.equal(confirms, 0);
});

test('개인 일정 공개 확인을 취소하면 공개 문서를 만들지 않는다', async () => {
  const { state, calls, actions } = fixture();
  state.open(plan(), { kind: 'private', id: 'mine123' });
  const before = state.snapshot();
  let confirms = 0;

  assert.deepEqual(await actions.getShareLink({ confirmPublicShare: async () => { confirms++; return false; } }), { status: 'cancelled' });
  assert.equal(confirms, 1);
  assert.deepEqual(calls, { saves: [], shares: [], urls: [] });
  assert.deepEqual(state.snapshot(), before);
});

test('공개 확인 중 일정이나 로그인 계정이 바뀌면 동의하더라도 공개하지 않는다', async () => {
  for (const change of ['plan', 'account', 'logout']) {
    const pending = deferred();
    const { state, session, calls, actions } = fixture();
    state.open(plan(), { kind: 'private', id: 'mine123' });
    const sharing = actions.getShareLink({ confirmPublicShare: () => pending.promise });
    if (change === 'plan') state.open(plan());
    else session.user = change === 'account' ? { uid: 'other' } : null;
    pending.resolve(true);

    assert.deepEqual(await sharing, { status: 'cancelled' }, change);
    assert.deepEqual(calls, { saves: [], shares: [], urls: [] }, change);
  }
});

test('공개 확인 중 같은 일정을 편집하면 확인 시점의 최신 사본을 공개한다', async () => {
  const confirmation = deferred();
  const write = deferred();
  const started = deferred();
  const { state, calls, actions } = fixture({ share: snapshot => { started.resolve(snapshot); return write.promise; } });
  const original = plan();
  state.open(original, { kind: 'private', id: 'mine123' });
  const sharing = actions.getShareLink({ confirmPublicShare: () => confirmation.promise });
  state.replaceDayItems(0, [{ title: '동의 전 편집', time: '11:00' }]);
  confirmation.resolve(true);
  const snapshot = await started.promise;
  assert.equal(snapshot.days[0].scheduleItems[0].title, '동의 전 편집');
  assert.notEqual(snapshot, original);
  state.replaceDayItems(0, [{ title: '공개 쓰기 중 추가 편집', time: '12:00' }]);
  write.resolve('published123');

  assert.deepEqual(await sharing, { status: 'ready', url: 'https://app.example/share/published123' });
  assert.equal(calls.shares.length, 1);
  assert.equal(snapshot.days[0].scheduleItems[0].title, '동의 전 편집');
  assert.equal(state.current.plan, original);
  assert.equal(state.current.source.id, 'mine123');
});

test('저장·공개 확인·공개 쓰기 오류는 호출자에게 전달하고 성공 처리하지 않는다', async () => {
  for (const stage of ['save', 'confirm', 'share']) {
    const failure = new Error(`${stage} failed`);
    const fail = async () => { throw failure; };
    const { state, calls, actions } = fixture({ update: stage === 'save' ? fail : undefined, share: stage === 'share' ? fail : undefined });
    state.open(plan(), { kind: 'private', id: 'mine123' });
    const before = state.snapshot();
    let notifications = 0;
    const operation = stage === 'save'
      ? actions.save({ onSaved: () => notifications++ })
      : actions.getShareLink({ confirmPublicShare: stage === 'confirm' ? fail : async () => true });

    await assert.rejects(operation, error => error === failure, stage);
    assert.deepEqual(state.snapshot(), before, stage);
    assert.deepEqual(calls.urls, [], stage);
    assert.equal(notifications, 0, stage);
    if (stage === 'confirm') assert.deepEqual(calls.shares, []);
  }
});

const shareDraft = (actions, overrides = {}) => actions.getShareLink({
  confirmPublicShare: () => { throw Error('a draft asks once, with the save confirm'); },
  confirmSaveAndShare: async () => true,
  saveBeforeShare: () => actions.save(),
  ...overrides,
});

test('새 초안은 한 번 확인한 뒤 저장하고 그 저장본을 공유한다', async () => {
  const { state, actions, calls } = fixture();
  state.open(plan());
  assert.deepEqual(await shareDraft(actions), { status: 'ready', url: 'https://app.example/share/published123' });
  assert.equal(calls.saves.length, 1);
  assert.equal(calls.shares.length, 1);
  assert.deepEqual({ kind: state.current.source.kind, id: state.current.source.id }, { kind: 'private', id: 'saved123' });
});

test('새 초안의 저장·공유 확인을 취소하면 아무것도 저장하지 않는다', async () => {
  const { state, actions, calls } = fixture();
  state.open(plan());
  assert.deepEqual(await shareDraft(actions, { confirmSaveAndShare: async () => false }), { status: 'cancelled' });
  assert.deepEqual(calls.saves, []);
  assert.deepEqual(calls.shares, []);
  assert.equal(state.current.source.kind, 'draft');
});

test('새 초안의 저장이 끝나지 않았거나 다른 버전이면 공유 링크를 만들지 않는다', async () => {
  for (const saved of [{ status: 'failed' }, { status: 'left' }, { status: 'account-changed' }]) {
    const { state, actions, calls } = fixture();
    state.open(plan());
    assert.deepEqual(await shareDraft(actions, { saveBeforeShare: async () => saved }), { status: 'cancelled' }, saved.status);
    assert.deepEqual(calls.shares, [], saved.status);
  }
});

test('새 초안을 저장하는 중 내용이 바뀌면 링크를 만들지 않고 그 사실을 알린다', async () => {
  const { state, actions, calls } = fixture({ save: () => { state.resolvePlaces(0, [{ index: 0, name: 'Real', address: 'addr' }]); return 'saved123'; } });
  state.open(plan());
  assert.deepEqual(await shareDraft(actions), { status: 'not-shared' });
  assert.deepEqual(calls.shares, []);
  assert.equal(state.current.source.id, 'saved123');
});

test('저장 중 계정이 바뀌면 새 초안의 공유 링크를 만들지 않는다', async () => {
  const { state, session, actions, calls } = fixture();
  state.open(plan());
  const result = await shareDraft(actions, { saveBeforeShare: async () => {
    const saved = await actions.save();
    session.user = { uid: 'other' };
    return saved;
  } });
  assert.deepEqual(result, { status: 'cancelled' });
  assert.deepEqual(calls.shares, []);
});

test('게스트의 새 초안은 저장 확인 없이 로그인을 요구한다', async () => {
  const { state, actions } = fixture({ user: null });
  state.open(plan());
  assert.deepEqual(await shareDraft(actions, { confirmSaveAndShare: () => { throw Error('must not confirm'); } }), { status: 'login-required' });
});

test('전달에 실패한 링크는 내용이 그대로면 확인이나 새 공개 문서 없이 다시 쓴다', async () => {
  const { state, actions, calls } = fixture();
  state.open(plan());
  const first = await shareDraft(actions);
  let asked = 0;
  const confirm = async () => { asked++; return true; };
  const retry = await actions.getShareLink({ confirmPublicShare: confirm, confirmSaveAndShare: confirm });
  assert.deepEqual(retry, first);
  assert.equal(asked, 0);
  assert.equal(calls.shares.length, 1);
});

test('전달에 성공한 뒤 다시 공유하면 지금처럼 확인받고 새 공개 문서를 만든다', async () => {
  const { state, actions, calls } = fixture();
  state.open(plan());
  const { url } = await shareDraft(actions);
  actions.linkDelivered(url);
  let asked = 0;
  await actions.getShareLink({ confirmPublicShare: async () => { asked++; return true; } });
  assert.equal(asked, 1);
  assert.equal(calls.shares.length, 2);
});

test('전달에 실패한 뒤 일정을 고치면 고친 내용으로 확인받고 새 공개 문서를 만든다', async () => {
  const { state, actions, calls } = fixture();
  state.open(plan());
  await shareDraft(actions);
  state.current.plan.days[0].scheduleItems[0].title = '창덕궁';
  let asked = 0;
  await actions.getShareLink({ confirmPublicShare: async () => { asked++; return true; } });
  assert.equal(asked, 1);
  assert.equal(calls.shares.length, 2);
  assert.equal(calls.shares[1].days[0].scheduleItems[0].title, '창덕궁');
});

test('전달에 실패한 링크를 다른 계정에 다시 주지 않는다', async () => {
  const { state, session, actions, calls } = fixture();
  state.open(plan());
  await shareDraft(actions);
  session.user = { uid: 'other' };
  await actions.getShareLink({ confirmPublicShare: async () => true });
  assert.equal(calls.shares.length, 2);
});

test('초안을 저장하면 초안 사본이 남지 않아 빈 /view에서 다시 저장할 수 없다', async () => {
  const { state, actions } = fixture();
  state.open(plan());
  await actions.save();
  assert.equal(state.activateDraft(), null);
  assert.equal(state.current.source.id, 'saved123');
});

test('초안을 저장해도 되돌리기와 수정 표시가 남는다', async () => {
  const { state, actions } = fixture();
  state.open(plan());
  const [first, second] = state.current.plan.days[0].scheduleItems.concat(plan().days[1].scheduleItems);
  state.editDayItems(0, [second], { undo: true });
  await actions.save();
  assert.deepEqual(state.current.dirtyDays, [0]);
  assert.equal(state.current.unsaved, false);
  assert.ok(state.undoDeletion(0));
  assert.deepEqual(state.current.plan.days[0].scheduleItems, [first]);
});

test('다른 기기에서 지운 일정을 새로 저장해도 되돌리기가 남고 지운 일정의 사본은 사라진다', async () => {
  const { state, actions } = fixture({ update: () => { throw Object.assign(Error('gone'), { code: 'not-found' }); } });
  state.open(plan(), { kind: 'private', id: 'gone1' });
  state.editDayItems(0, [], { undo: true });
  await actions.save();
  assert.equal(state.current.source.id, 'saved123');
  assert.ok(state.current.undoByDay[0]);
  assert.equal(state.activateDocument('gone1', { userId: 'owner' }), null);
});
