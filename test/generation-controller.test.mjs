import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationController } from '../src/app/generation-controller.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture({ userId = 'owner', path = '/plan' } = {}) {
  const context = { userId, path };
  const calls = [];
  const pending = [];
  const successCallbacks = [];
  const backCallbacks = [];
  const controller = createGenerationController({
    getContext: () => ({ ...context }),
    generate(request) {
      calls.push(['generate', request]);
      const job = deferred();
      pending.push(job);
      return job.promise;
    },
    view: {
      showLoading: () => calls.push(['loading']),
      showSuccess(onContinue) {
        calls.push(['success']);
        successCallbacks.push(onContinue);
      },
      showError(error, onBack) {
        calls.push(['error', error]);
        backCallbacks.push(onBack);
      },
      showForm: () => calls.push(['form']),
      showRetry: message => calls.push(['retry', message]),
      stop: () => calls.push(['stop']),
    },
    clearResults: () => calls.push(['clear']),
    applyResult: result => calls.push(['apply', result]),
    navigate: destination => calls.push(['navigate', destination]),
    onComplete: () => calls.push(['complete']),
    notifyError: message => calls.push(['notify', message]),
    logError: (...args) => calls.push(['log', ...args]),
  });
  const of = name => calls.filter(([kind]) => kind === name);
  return { controller, context, calls, pending, successCallbacks, backCallbacks, of };
}

test('로그인하지 않았거나 생성 화면이 아니면 생성 요청과 화면 변경을 실행하지 않는다', async () => {
  for (const context of [{ userId: null }, { path: '/view' }, { path: '/profile/trips' }]) {
    const { controller, calls } = fixture(context);
    assert.equal(await controller.start({ city: '서울' }), 'ignored');
    assert.deepEqual(calls, []);
  }
});

test('생성 성공은 결과를 반영하되 계속 버튼을 눌렀을 때만 일정 화면으로 이동한다', async () => {
  const { controller, calls, pending, successCallbacks, of } = fixture();
  const request = { city: '서울' };
  const result = { days: [{ day: 1, scheduleItems: [] }] };
  const running = controller.start(request);
  assert.equal(of('clear').length, 1);
  assert.equal(of('loading').length, 1);
  assert.deepEqual(of('generate'), [['generate', request]]);
  assert.ok(calls.findIndex(([kind]) => kind === 'loading') < calls.findIndex(([kind]) => kind === 'generate'));

  pending[0].resolve(result);
  assert.equal(await running, 'success');
  assert.deepEqual(of('apply'), [['apply', result]]);
  assert.equal(of('success').length, 1);
  assert.equal(of('stop').length, 1);
  assert.equal(of('complete').length, 1);
  assert.deepEqual(of('navigate'), []);
  successCallbacks[0]();
  assert.deepEqual(of('navigate'), [['navigate', '/view']]);
});

test('생성 오류는 실패 화면으로 전달하고 429 오류에만 추가 안내를 표시한다', async () => {
  for (const message of ['서버 연결 실패', '429 요청이 많습니다']) {
    const { controller, pending, backCallbacks, of } = fixture();
    const error = new Error(message);
    const running = controller.start({});
    pending[0].reject(error);
    assert.equal(await running, 'error');
    assert.deepEqual(of('error'), [['error', error]]);
    assert.deepEqual(of('apply'), []);
    assert.equal(of('log').length, 1);
    assert.deepEqual(of('notify'), message.includes('429') ? [['notify', `⏳ ${message}`]] : []);
    assert.equal(of('complete').length, 1);
    assert.equal(of('stop').length, 1);
    backCallbacks[0]();
    assert.equal(of('form').length, 1);
  }
});

test('새 생성이 진행 중일 때 이전 요청이 성공해도 새 화면·결과·완료 처리를 건드리지 않는다', async () => {
  const { controller, calls, pending, of } = fixture();
  const first = controller.start({ city: '서울' });
  const second = controller.start({ city: '부산' });
  const before = [...calls];
  pending[0].resolve({ city: '서울' });
  assert.equal(await first, 'stale');
  assert.deepEqual(calls, before);

  pending[1].resolve({ city: '부산' });
  assert.equal(await second, 'success');
  assert.deepEqual(of('apply'), [['apply', { city: '부산' }]]);
  assert.equal(of('success').length, 1);
  assert.equal(of('complete').length, 1);
});

test('새 생성이 성공한 뒤 도착한 이전 요청의 오류는 성공 화면과 안내를 바꾸지 않는다', async () => {
  const { controller, calls, pending, of } = fixture();
  const first = controller.start({ city: '서울' });
  const second = controller.start({ city: '부산' });
  pending[1].resolve({ city: '부산' });
  assert.equal(await second, 'success');
  const before = [...calls];
  pending[0].reject(new Error('429 이전 요청 오류'));
  assert.equal(await first, 'stale');
  assert.deepEqual(calls, before);
  assert.deepEqual(of('notify'), []);
});

test('다른 화면으로 갔다 돌아와도 이탈 전에 시작한 결과는 적용하지 않고 완료 신호는 한 번만 보낸다', async () => {
  const { controller, context, calls, pending, of } = fixture();
  const running = controller.start({});
  context.path = '/profile/trips';
  controller.syncContext();
  assert.equal(of('form').length, 1);
  assert.equal(of('complete').length, 1);
  const afterLeave = [...calls];
  controller.syncContext();
  assert.deepEqual(calls, afterLeave);
  context.path = '/plan';
  controller.syncContext();
  controller.enterPlan();
  const afterReturn = [...calls];
  pending[0].resolve({ days: [] });
  assert.equal(await running, 'stale');
  assert.deepEqual(calls, afterReturn);
  assert.deepEqual(of('apply'), []);
  assert.equal(of('complete').length, 1);
});

test('생성 중 계정을 바꾸거나 로그아웃하면 이전 계정의 결과를 즉시 무효화한다', async () => {
  for (const nextUserId of ['other', null]) {
    const { controller, context, calls, pending, of } = fixture();
    const running = controller.start({});
    context.userId = nextUserId;
    controller.syncContext();
    assert.equal(of('form').length, 1);
    assert.equal(of('complete').length, 1);
    const before = [...calls];
    pending[0].resolve({ days: [] });
    assert.equal(await running, 'stale');
    assert.deepEqual(calls, before);
    assert.deepEqual(of('apply'), []);
  }
});

test('같은 계정·생성 화면의 재평가는 진행 중 화면과 성공·실패 화면을 초기화하지 않는다', async () => {
  for (const outcome of ['success', 'error']) {
    const { controller, calls, pending, of } = fixture();
    controller.enterPlan();
    assert.equal(of('form').length, 1);
    const running = controller.start({});
    const beforeLoading = [...calls];
    controller.syncContext();
    controller.enterPlan();
    assert.deepEqual(calls, beforeLoading);
    if (outcome === 'success') pending[0].resolve({ days: [] });
    else pending[0].reject(new Error('생성 실패'));
    assert.equal(await running, outcome);
    const afterOutcome = [...calls];
    controller.syncContext();
    controller.enterPlan();
    assert.deepEqual(calls, afterOutcome);
  }
});

test('재시도 안내는 현재 계정·화면의 진행 중 요청에만 표시한다', async () => {
  const { controller, context, pending, of } = fixture();
  controller.retry('요청 전');
  const running = controller.start({});
  controller.retry('다시 계산 중');
  context.path = '/profile/trips';
  controller.retry('다른 화면');
  context.path = '/plan';
  context.userId = 'other';
  controller.retry('다른 계정');
  context.userId = 'owner';
  pending[0].resolve({ days: [] });
  await running;
  controller.retry('완료 후');
  assert.deepEqual(of('retry'), [['retry', '다시 계산 중']]);
});

test('이전 성공 화면의 계속 버튼은 새 요청이나 화면 이탈 뒤에 실행되어도 이동하지 않는다', async () => {
  const { controller, context, pending, successCallbacks, of } = fixture();
  const first = controller.start({});
  pending[0].resolve({ version: 1 });
  await first;
  const second = controller.start({});
  successCallbacks[0]();
  assert.deepEqual(of('navigate'), []);
  pending[1].resolve({ version: 2 });
  await second;
  context.path = '/profile/trips';
  successCallbacks[1]();
  assert.deepEqual(of('navigate'), []);
  controller.syncContext();
  context.path = '/plan';
  successCallbacks[1]();
  assert.deepEqual(of('navigate'), []);
});

test('이전 실패 화면의 복귀 버튼은 새 요청이나 계정 변경 뒤의 화면을 초기화하지 않는다', async () => {
  const { controller, context, calls, pending, backCallbacks } = fixture();
  const first = controller.start({});
  pending[0].reject(new Error('첫 요청 실패'));
  await first;
  const second = controller.start({});
  const beforeOldBack = [...calls];
  backCallbacks[0]();
  assert.deepEqual(calls, beforeOldBack);
  pending[1].reject(new Error('둘째 요청 실패'));
  await second;
  context.userId = 'other';
  const beforeAccountBack = [...calls];
  backCallbacks[1]();
  assert.deepEqual(calls, beforeAccountBack);
});

test('경로 동기화보다 응답이 먼저 도착해도 변경된 경로·계정의 결과는 반영하지 않는다', async () => {
  for (const change of ['path', 'userId']) {
    const { controller, context, pending, of } = fixture();
    const running = controller.start({});
    context[change] = change === 'path' ? '/profile/trips' : 'other';
    pending[0].resolve({ days: [] });
    assert.equal(await running, 'stale');
    assert.deepEqual(of('apply'), []);
    assert.deepEqual(of('success'), []);
    assert.deepEqual(of('navigate'), []);
  }
});
