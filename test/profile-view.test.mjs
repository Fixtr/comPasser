import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEmptyProfile, createProfileService } from '../src/domains/profile/services/profile-service.mjs';

// 실제 화면 핸들러와 서비스를 함께 실행한다. DOM 표시와 외부 SDK만 대체한다.
const source = readFileSync(new URL('../src/domains/profile/ui/profile-view.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '');

function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

function element() {
  const classes = new Set();
  return {
    value: '', disabled: false, textContent: '', dataset: {}, listeners: {},
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    addEventListener(type, handler) { this.listeners[type] = handler; },
  };
}

function fixture({ user = { uid: 'owner' }, data, hooks = {} } = {}) {
  const session = { user, data };
  const calls = { basic: [], extended: [], writes: [], stages: [], events: [], toasts: [], errors: [], logouts: 0 };
  const controls = new Map([
    'profile-language', 'input-birthday', 'btn-delete-account-trigger', 'delete-modal',
    'btn-modal-cancel', 'btn-modal-confirm', 'modal-close-x', 'account-deletion-status',
  ].map(id => [id, element()]));
  const location = { href: '/profile/security' };
  const dependencies = {
    HTMLElement: class {
      attachShadow() { this.shadowRoot = { getElementById: id => controls.get(id) || null, querySelectorAll: () => [] }; }
    },
    customElements: { define() {} },
    window: { location, dispatchEvent: event => calls.events.push(event) },
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } },
    console: { error: (...args) => calls.errors.push(args) },
    getCurrentUser: () => session.user,
    requireRecentLoginForDeletion: async () => { await hooks.reauthenticate?.(); },
    createEmptyProfile, createProfileService,
    clearTimeout() {}, setTimeout() { return 1; },
    accountDeletionClient: {
      async request(userId) { calls.stages.push(['request', userId]); return await hooks.request?.() || { state: 'completed' }; },
      async status() { return await hooks.status?.() || { state: 'not-found' }; },
      hasReceipt() { return hooks.hasReceipt?.() ?? true; },
    },
    async loadFirestore() {
      return {
        db: {}, doc: (_db, collection, userId) => ({ collection, userId }),
        async getDoc() {
          const snapshot = session.data;
          await hooks.read?.();
          return { exists: () => snapshot !== undefined, data: () => snapshot };
        },
        async setDoc(ref, changes, options) {
          calls.writes.push({ ref, changes, options });
          await hooks.write?.();
        },
        async deleteDoc(ref) {
          calls.stages.push(['profile', ref.userId]);
          await hooks.deleteProfile?.();
        },
      };
    },
    async deleteAllUserItineraries(userId) {
      calls.stages.push(['itineraries', userId]);
      await hooks.deleteItineraries?.();
    },
    async deleteCurrentUser() {
      calls.stages.push(['auth', session.user?.uid]);
      if (hooks.deleteAuth) await hooks.deleteAuth();
      else session.user = null;
    },
    async logout() {
      calls.logouts++;
      await hooks.logout?.();
      session.user = null;
    },
    showErrorToast: (...args) => calls.toasts.push(args),
    getLang: () => 'ko', setLang: () => {},
    t: key => key,
  };
  const View = new Function(...Object.keys(dependencies), `${source}\nreturn ProfileView;`)(...Object.values(dependencies));
  const view = new View();
  view.updateBasicAuthUI = user => calls.basic.push(user.uid);
  view.updateExtendedProfileUI = () => calls.extended.push({ ...view.userData });
  view.setupEventListeners();
  return {
    view, session, calls, location,
    control: id => controls.get(id),
    deleteAccount() {
      controls.get('btn-delete-account-trigger').listeners.click();
      return controls.get('btn-modal-confirm').listeners.click();
    },
  };
}

function assertDeleteControlsRestored(app) {
  assert.equal(app.control('btn-modal-confirm').disabled, false);
  assert.equal(app.control('btn-modal-confirm').textContent, 'confirmDeleteAccountBtn');
  assert.equal(app.control('delete-modal').classList.contains('show'), false);
}

test('프로필 조회는 인증 정보를 먼저 표시하고 문서가 없는 계정에 이전 계정 값을 섞지 않는다', async () => {
  const started = deferred();
  const pending = deferred();
  const app = fixture({
    data: { phoneNumber: '01012345678', isVerified: true },
    hooks: { read: () => { started.resolve(); return pending.promise; } },
  });
  const loading = app.view.loadUserData();
  assert.deepEqual(app.calls.basic, ['owner']);
  await started.promise;
  assert.deepEqual(app.calls.extended, []);
  pending.resolve();
  await loading;
  assert.deepEqual(app.view.userData, { birthday: '' });

  app.session.user = { uid: 'other' };
  app.session.data = undefined;
  await app.view.loadUserData();
  assert.deepEqual(app.view.userData, createEmptyProfile());
  assert.deepEqual(app.calls.basic, ['owner', 'other']);
});

test('생일 저장은 해당 값만 갱신하고 편집 상태를 종료한다', async () => {
  const app = fixture();
  app.view.userData = createEmptyProfile();
  app.view.editingField = 'birthday';
  app.control('input-birthday').value = ' 2000-01-02 ';
  await app.view.handleSave('birthday');
  assert.deepEqual(app.view.userData, { birthday: '2000-01-02' });
  assert.equal(app.view.editingField, null);

  assert.equal(app.calls.extended.length, 1);
  assert.deepEqual(app.calls.writes[0], {
    ref: { collection: 'users', userId: 'owner' },
    changes: { birthday: '2000-01-02' }, options: { merge: true },
  });
});

test('저장 실패는 기존 값·입력 상태를 유지하고 실패 알림을 표시한다', async () => {
  const failure = new Error('offline');
  const app = fixture({ hooks: { write: () => { throw failure; } } });
  app.view.editingField = 'birthday';
  app.control('input-birthday').value = '2000-01-02';

  await app.view.handleSave('birthday');

  assert.deepEqual(app.view.userData, createEmptyProfile());
  assert.equal(app.view.editingField, 'birthday');
  assert.deepEqual(app.calls.extended, []);
  assert.deepEqual(app.calls.toasts, [['저장에 실패했습니다.']]);
  assert.equal(app.calls.errors[0][1], failure);
});

test('조회·저장 도중 계정이 바뀌면 이전 응답을 현재 화면에 적용하지 않는다', async () => {
  for (const stage of ['read', 'write']) {
    const started = deferred();
    const pending = deferred();
    const app = fixture({ data: { phoneNumber: 'old-user-phone' }, hooks: {
      [stage]: () => { started.resolve(); return pending.promise; },
    } });
    app.view.editingField = 'birthday';
    app.control('input-birthday').value = '2000-01-02';
    const operation = stage === 'read' ? app.view.loadUserData() : app.view.handleSave('birthday');
    await started.promise;
    app.session.user = { uid: 'other' };
    pending.resolve();
    await operation;

    assert.deepEqual(app.view.userData, createEmptyProfile(), stage);
    assert.deepEqual(app.calls.extended, [], stage);
    assert.equal(app.view.editingField, 'birthday', stage);
  }
});


test('서버 completed일 때만 삭제 알림·로그아웃·로그인 이동을 한다', async () => {
  const pending = deferred();
  const app = fixture({ hooks: { request: () => pending.promise } });
  const deleting = app.deleteAccount();
  assert.equal(app.control('btn-modal-confirm').disabled, true); assert.deepEqual(app.calls.events, []);
  pending.resolve({ state: 'completed' }); await deleting;
  assert.deepEqual(app.calls.stages, [['request', 'owner']]);
  assert.equal(app.calls.events[0].type, 'itinerary-deleted');
  assert.deepEqual(app.calls.events[0].detail, { id: null, userId: 'owner' });
  assert.equal(app.calls.logouts, 1); assert.equal(app.location.href, '/account-deletion-status'); assertDeleteControlsRestored(app);
});
test('pending은 완료나 로그아웃 없이 중복 탈퇴 버튼을 잠근다', async () => {
  const app = fixture({ hooks: { request: () => ({ state: 'pending' }), status: () => ({ state: 'pending' }) } });
  await app.deleteAccount();
  assert.deepEqual(app.calls.events, []); assert.equal(app.calls.logouts, 0);
  assert.equal(app.control('btn-delete-account-trigger').disabled, true);
  assert.equal(app.control('account-deletion-status').textContent, 'accountDeletionPending');
  assert.equal(app.location.href, '/profile/security'); assertDeleteControlsRestored(app);
});
test('접수 응답 유실은 데이터 보존을 주장하지 않고 진행 상태를 조회한다', async () => {
  const app = fixture({ hooks: {
    request: () => { throw Object.assign(new Error('lost'), { deletionStatusUnknown: true }); },
    status: () => ({ state: 'pending' }),
  } });
  await app.deleteAccount();
  assert.deepEqual(app.calls.toasts, [['accountDeletionUnknown']]); assert.equal(app.calls.logouts, 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.control('account-deletion-status').textContent, 'accountDeletionPending'); assertDeleteControlsRestored(app);
});
test('재로그인 안내 및 로그아웃 실패 시에도 확인창과 버튼을 복구한다', async () => {
  for (const failLogout of [false, true]) {
    const app = fixture({ hooks: {
      reauthenticate: () => { throw Object.assign(new Error('old'), { code: 'auth/requires-recent-login' }); },
      logout: () => { if (failLogout) throw new Error('offline'); },
    } });
    await app.deleteAccount(); assert.deepEqual(app.calls.stages, []);
    assert.deepEqual(app.calls.toasts, [['accountDeletionSignInRequired', { duration: 5000 }], ...(failLogout ? [['accountDeletionSignOutFailed']] : [])]);
    assert.equal(app.location.href, failLogout ? '/profile/security' : '/login?next=%2Fprofile%2Fsecurity');
    assertDeleteControlsRestored(app);
  }
});
test('사전 확인·접수 중 바뀐 계정은 로그아웃하거나 이동시키지 않는다', async () => {
  for (const stage of ['reauthenticate', 'request']) {
    const pending = deferred(); const started = deferred();
    const app = fixture({ hooks: { [stage]: () => { started.resolve(); return pending.promise; } } });
    const deleting = app.deleteAccount(); await started.promise;
    app.session.user = { uid: 'other' }; pending.resolve({ state: 'completed' }); await deleting;
    assert.equal(app.calls.logouts, 0); assert.deepEqual(app.calls.events, []);
    assert.equal(app.location.href, '/profile/security'); assertDeleteControlsRestored(app);
  }
});
test('확인창 취소는 늦은 인증 성공 뒤에도 접수하지 않는다', async () => {
  const pending = deferred();
  const app = fixture({ hooks: { reauthenticate: () => pending.promise } });
  const deleting = app.deleteAccount();
  app.control('btn-modal-cancel').listeners.click(); pending.resolve(); await deleting;
  assert.deepEqual(app.calls.stages, []); assert.equal(app.calls.logouts, 0); assertDeleteControlsRestored(app);
});
test('접수 전 인증 오류는 강제 로그아웃 없이 재시도를 허용한다', async () => {
  const app = fixture({ hooks: { reauthenticate: () => { throw new Error('offline'); } } });
  await app.deleteAccount();
  assert.deepEqual(app.calls.stages, []); assert.deepEqual(app.calls.toasts, [['accountDeletionCheckFailed']]);
  assert.equal(app.calls.logouts, 0); assertDeleteControlsRestored(app);
});
test('화면을 다시 열면 기존 pending 작업을 조회하며 삭제를 새로 요청하지 않는다', async () => {
  const app = fixture({ hooks: { status: () => ({ state: 'pending' }) } });
  await app.view.loadUserData();
  assert.deepEqual(app.calls.stages, []); assert.equal(app.view.deletionState, 'pending');
});
test('기존 탈퇴 요청을 조회하는 동안 새 접수를 막고 상태를 안내한다', async () => {
  const pending = deferred();
  const app = fixture({ hooks: { status: () => pending.promise } });
  app.view.watchDeletion(app.session.user);
  assert.equal(app.control('account-deletion-status').textContent, 'accountDeletionChecking');
  assert.equal(app.control('btn-delete-account-trigger').disabled, true);
  pending.resolve({ state: 'pending' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.control('account-deletion-status').dataset.state, 'pending');
  assert.equal(app.control('btn-delete-account-trigger').disabled, true);
  assert.deepEqual(app.calls.stages, []);
});
test('접수 상태를 확인할 수 없으면 중복 접수를 막고, 접수 기록 없이 조회만 실패하면 버튼을 복구한다', async () => {
  for (const hasReceipt of [true, false]) {
    const app = fixture({ hooks: { hasReceipt: () => hasReceipt, status: () => { throw new Error('offline'); } } });
    app.view.watchDeletion(app.session.user);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.control('account-deletion-status').textContent, hasReceipt ? 'accountDeletionUnknown' : '');
    assert.equal(app.control('btn-delete-account-trigger').disabled, hasReceipt);
  }
});
test('오래된 상태 응답은 바뀐 계정을 로그아웃시키지 않는다', async () => {
  const pending = deferred();
  const app = fixture({ hooks: { status: () => pending.promise } });
  app.view.watchDeletion(app.session.user); app.session.user = { uid: 'other' };
  pending.resolve({ state: 'completed' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.calls.logouts, 0); assert.deepEqual(app.calls.events, []);
});
test('blocked는 관리자 확인을 표시하고 자동 완료 처리하지 않는다', async () => {
  const app = fixture(); await app.view.applyDeletionStatus({ state: 'blocked' }, 'owner');
  assert.equal(app.control('account-deletion-status').textContent, 'accountDeletionBlocked');
  assert.equal(app.control('btn-delete-account-trigger').disabled, true); assert.equal(app.calls.logouts, 0);
});
test('완료 후 로그아웃 실패 시 접수번호를 남겨 완료 상태를 다시 확인할 수 있다', async () => {
  const app = fixture({ hooks: { logout: () => { throw new Error('offline'); } } });
  await app.deleteAccount();
  assert.equal(app.calls.forgotten, undefined); assert.equal(app.view.deletionState, 'completed');
  assert.deepEqual(app.calls.toasts, [['accountDeletionSignOutFailed']]); assert.equal(app.location.href, '/profile/security');
});

test('같은 UID로 다시 가입한 계정에는 이전 완료 응답을 적용하지 않는다', async () => {
  const app = fixture({ user: { uid: 'owner', metadata: { creationTime: 'new' } } });
  await app.view.applyDeletionStatus({ state: 'completed' }, 'owner', 'old');
  assert.equal(app.calls.logouts, 0); assert.deepEqual(app.calls.events, []);
});

test('이전 계정의 재로그인 오류로 같은 UID의 새 계정을 로그아웃하지 않는다', async () => {
  const pending = deferred();
  const app = fixture({ user: { uid: 'owner', metadata: { creationTime: 'old' } }, hooks: { reauthenticate: async () => {
    await pending.promise; throw Object.assign(new Error('old login'), { code: 'auth/requires-recent-login' });
  } } });
  const deleting = app.deleteAccount();
  app.session.user = { uid: 'owner', metadata: { creationTime: 'new' } };
  pending.resolve(); await deleting;
  assert.equal(app.calls.logouts, 0); assert.deepEqual(app.calls.toasts, []);
});
