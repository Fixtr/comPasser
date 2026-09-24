import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyProfile, createProfileService } from '../src/domains/profile/services/profile-service.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

function fixture({ user = { uid: 'owner' }, data, hooks = {} } = {}) {
  const session = { user };
  const calls = { loads: 0, reads: [], writes: [], mutations: [], notifications: [] };
  const db = {};
  const sdk = {
    db,
    doc(database, collection, id) {
      assert.equal(database, db);
      return { collection, id };
    },
    async getDoc(ref) {
      calls.reads.push(ref);
      await hooks.read?.();
      return { exists: () => data !== undefined, data: () => data };
    },
    async setDoc(ref, changes, options) {
      calls.writes.push({ ref, changes, options });
      await hooks.write?.();
    },
    async deleteDoc(ref) {
      calls.mutations.push({ stage: 'profile', ref });
      await hooks.deleteProfile?.();
    },
  };
  const service = createProfileService({
    getCurrentUser: () => session.user,
    requireRecentLogin: async userId => {
      assert.equal(userId, session.user?.uid);
      await hooks.reauthenticate?.();
    },
    async loadFirestore() {
      calls.loads++;
      await hooks.load?.();
      return sdk;
    },
    async requestAccountDeletion(userId) {
      calls.mutations.push({ stage: 'request', userId });
      return await hooks.request?.() || { state: 'pending', receipt: 'a'.repeat(64) };
    },
  });
  return { session, calls, service };
}

test('기본 프로필은 호출마다 새 객체이며 문서가 없는 사용자도 기본값으로 조회한다', async () => {
  const defaults = { birthday: '' };
  const first = createEmptyProfile();
  assert.deepEqual(first, defaults);
  assert.notEqual(first, createEmptyProfile());
  first.birthday = '변경';
  assert.deepEqual(createEmptyProfile(), defaults);

  const { service, calls } = fixture();
  assert.deepEqual(await service.loadProfile(), { userId: 'owner', profile: defaults });
  assert.deepEqual(calls.reads, [{ collection: 'users', id: 'owner' }]);
  assert.deepEqual(calls.writes, []);
});

test('저장된 프로필은 이전 휴대전화·인증 값을 노출하지 않고 원본 문서를 변경하지 않는다', async () => {
  const data = { phoneNumber: '01012345678', isVerified: true, customSetting: 'keep' };
  const { service } = fixture({ data });

  const result = await service.loadProfile();

  assert.deepEqual(result, {
    userId: 'owner',
    profile: { birthday: '' },
  });
  assert.notEqual(result.profile, data);
  assert.equal(Object.hasOwn(data, 'birthday'), false);
});

test('로그인하지 않았으면 조회·저장·탈퇴 모두 데이터나 인증 서비스에 접근하지 않는다', async () => {
  const { service, calls } = fixture({ user: null });

  assert.equal(await service.loadProfile(), null);
  assert.equal(await service.saveField('birthday', '2000-01-02'), null);
  assert.equal(await service.deleteAccount(), null);
  assert.deepEqual(calls, { loads: 0, reads: [], writes: [], mutations: [], notifications: [] });
});

test('조회 완료 전에 계정이 바뀌거나 로그아웃하면 이전 계정의 프로필을 반환하지 않는다', async () => {
  for (const nextUser of [{ uid: 'other' }, null]) {
    const started = deferred();
    const pending = deferred();
    const { service, session, calls } = fixture({
      data: { phoneNumber: 'previous-account' },
      hooks: { read: () => { started.resolve(); return pending.promise; } },
    });
    const loading = service.loadProfile();
    await started.promise;
    session.user = nextUser;
    pending.resolve();

    assert.equal(await loading, null);
    assert.deepEqual(calls.reads, [{ collection: 'users', id: 'owner' }]);
  }
});

test('생일 저장은 값만 정리해 병합하고 이전 휴대전화·인증 값은 건드리지 않는다', async () => {
  const { service, calls } = fixture();

  assert.deepEqual(await service.saveField('birthday', ' 2000-01-02 '), {
    userId: 'owner', changes: { birthday: '2000-01-02' },
  });
  assert.deepEqual(await service.saveField('birthday', null), {
    userId: 'owner', changes: { birthday: '' },
  });
  assert.deepEqual(calls.writes, [
    { ref: { collection: 'users', id: 'owner' }, changes: { birthday: '2000-01-02' }, options: { merge: true } },
    { ref: { collection: 'users', id: 'owner' }, changes: { birthday: '' }, options: { merge: true } },
  ]);
});

test('허용하지 않은 프로필 필드는 저장하지 않는다', async () => {
  const { service, calls } = fixture();

  for (const field of ['userId', 'phoneNumber', 'isVerified', '__proto__', '']) {
    await assert.rejects(service.saveField(field, 'unexpected'));
  }

  assert.deepEqual(calls.writes, []);
});

test('저장 준비 중 계정이 바뀌면 쓰지 않고, 쓰기 중 바뀌면 이전 계정의 완료 결과를 반환하지 않는다', async () => {
  for (const stage of ['load', 'write']) {
    const started = deferred();
    const pending = deferred();
    const { service, session, calls } = fixture({
      hooks: { [stage]: () => { started.resolve(); return pending.promise; } },
    });
    const saving = service.saveField('birthday', '2000-01-02');
    await started.promise;
    session.user = { uid: 'other' };
    pending.resolve();

    assert.equal(await saving, null, stage);
    assert.equal(calls.writes.length, stage === 'load' ? 0 : 1, stage);
    if (stage === 'write') assert.equal(calls.writes[0].ref.id, 'owner');
  }
});


test('탈퇴는 사전 확인 후 서버에 접수만 하고 로컬 문서나 Auth를 직접 삭제하지 않는다', async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.deleteAccount(), { userId: 'owner', identityCreatedAt: undefined, state: 'pending', receipt: 'a'.repeat(64) });
  assert.deepEqual(calls.mutations, [{ stage: 'request', userId: 'owner' }]);
  assert.equal(calls.loads, 0); assert.deepEqual(calls.notifications, []);
});
test('서버 접수 실패는 로컬 삭제로 폴백하지 않고 원래 오류를 전달한다', async () => {
  const failure = Object.assign(new Error('offline'), { deletionStatusUnknown: true });
  const { service, calls } = fixture({ hooks: { request: () => { throw failure; } } });
  await assert.rejects(service.deleteAccount(), error => error === failure);
  assert.deepEqual(calls.mutations.map(item => item.stage), ['request']); assert.equal(calls.loads, 0);
});
test('로그인 확인·접수 중 계정이 바뀌면 다른 계정에 완료를 전달하지 않는다', async () => {
  for (const stage of ['reauthenticate', 'request']) {
    for (const nextUser of [{ uid: 'other' }, null]) {
      const started = deferred(); const pending = deferred();
      const { service, session, calls } = fixture({ hooks: { [stage]: () => { started.resolve(); return pending.promise; } } });
      const deleting = service.deleteAccount(); await started.promise;
      session.user = nextUser; pending.resolve();
      await assert.rejects(deleting, { code: 'profile/account-changed' });
      assert.equal(calls.mutations.length, stage === 'reauthenticate' ? 0 : 1);
    }
  }
});
test('조회·저장 오류를 성공으로 처리하지 않는다', async () => {
  for (const [operation, stage] of [['loadProfile','load'],['loadProfile','read'],['saveField','load'],['saveField','write']]) {
    const failure = new Error('offline');
    const { service } = fixture({ hooks: { [stage]: () => { throw failure; } } });
    await assert.rejects(service[operation]('birthday', '2000-01-02'), error => error === failure);
  }
});
test('재로그인 필요·인증 실패는 접수 전에 멈춘다', async () => {
  for (const code of ['auth/requires-recent-login', 'auth/network-request-failed']) {
    const failure = Object.assign(new Error('failed'), { code });
    const { service, calls } = fixture({ hooks: { reauthenticate: () => { throw failure; } } });
    await assert.rejects(service.deleteAccount(), error => error === failure); assert.deepEqual(calls.mutations, []);
  }
});
test('사전 확인 중 취소하면 늦은 성공 뒤에도 접수하지 않는다', async () => {
  const pending = deferred();
  const { service, calls } = fixture({ hooks: { reauthenticate: () => pending.promise } });
  let cancelled = false;
  const deleting = service.deleteAccount({ isCancelled: () => cancelled });
  cancelled = true; pending.resolve();
  assert.equal(await deleting, null); assert.deepEqual(calls.mutations, []);
});
test('중복 접수는 진행 중 한 번만 요청하고 이후 재시도할 수 있다', async () => {
  const pending = deferred();
  const { service, calls } = fixture({ hooks: { reauthenticate: () => pending.promise } });
  const first = service.deleteAccount(); assert.equal(await service.deleteAccount(), null);
  pending.resolve(); await first; assert.equal(calls.mutations.length, 1);
  await service.deleteAccount(); assert.equal(calls.mutations.length, 2);
});
test('서버의 pending, blocked, completed 결과를 섞지 않는다', async () => {
  for (const state of ['pending', 'blocked', 'completed']) {
    const { service } = fixture({ hooks: { request: () => ({ state }) } });
    assert.equal((await service.deleteAccount()).state, state);
  }
});
