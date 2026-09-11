import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationProgressView } from '../src/domains/planner/ui/generation-progress.js';
import { createGenerationController } from '../src/app/generation-controller.mjs';

function element() {
    const classes = new Set();
    let html = '';
    let banner = null;
    return {
        style: {}, dataset: {}, textContent: '', onclick: null, offsetWidth: 100,
        classList: {
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            contains: value => classes.has(value),
        },
        get innerHTML() { return html; },
        set innerHTML(value) {
            html = value;
            banner = value.includes('class="ad-banner"') ? element() : null;
        },
        querySelector: selector => selector === '.ad-banner' ? banner : null,
    };
}

function harness(options = {}) {
    const ids = ['travel-form-view', 'loading-transition-view', 'loading-spinner',
        'loading-text', 'loading-subtext', 'show-results-btn', 'ad-banner-carousel'];
    const elements = Object.fromEntries(ids.map(id => [id, element()]));
    elements['travel-form-view'].classList.add('hidden-view');
    elements['loading-transition-view'].classList.add('hidden-view');
    const scheduled = new Map();
    const pending = new Map();
    let nextId = 0;
    const schedule = (kind, callback, delay) => {
        const id = ++nextId;
        const task = { id, kind, callback, delay };
        scheduled.set(id, task);
        pending.set(id, task);
        return id;
    };
    const timers = {
        setInterval: (callback, delay) => schedule('interval', callback, delay),
        clearInterval: id => pending.delete(id),
        setTimeout: (callback, delay) => schedule('timeout', callback, delay),
        clearTimeout: id => pending.delete(id),
        requestAnimationFrame: callback => schedule('frame', callback),
        cancelAnimationFrame: id => pending.delete(id),
    };
    const ads = options.ads ?? [
        { title: '첫 광고', desc: '첫 설명', icon: '🌐', bgColor: '#fff', link: 'https://example.com/first', imageUrl: '/first.png' },
        { title: '두 번째 광고', desc: '다음 설명', icon: '🎫', bgColor: '#eee', link: 'https://example.com/second' },
    ];
    const view = createGenerationProgressView({
        document: { getElementById: id => elements[id] },
        translate: key => `번역:${key}`,
        ads, timers,
    });
    const tasks = (kind, delay) => [...pending.values()].filter(task => task.kind === kind
        && (delay === undefined || task.delay === delay));
    const fire = task => {
        if (task.kind !== 'interval') pending.delete(task.id);
        task.callback();
    };
    return { view, elements, pending, scheduled, tasks, fire };
}

test('생성 시작은 폼과 이전 버튼을 숨기고 기존 문구·광고·주기로 대기를 표시한다', () => {
    const h = harness();
    const e = h.elements;
    e['show-results-btn'].onclick = () => assert.fail('이전 결과 버튼');
    e['loading-text'].dataset.tone = 'danger';
    h.view.showLoading();
    assert.equal(e['travel-form-view'].style.display, 'none');
    assert.equal(e['loading-transition-view'].style.display, 'flex');
    assert.equal(e['loading-transition-view'].classList.contains('hidden-view'), false);
    assert.equal(e['loading-spinner'].style.display, 'block');
    assert.equal(e['loading-text'].textContent, '번역:loadingText');
    assert.equal(e['loading-text'].dataset.tone, undefined);
    assert.equal(e['loading-subtext'].textContent, 'AI가 최적의 여행 장소를 탐색하고 있습니다');
    assert.equal(e['loading-subtext'].classList.contains('loading-text-fade'), true);
    assert.equal(e['show-results-btn'].style.display, 'none');
    assert.equal(e['show-results-btn'].textContent, '번역:showResultsBtn');
    assert.equal(e['show-results-btn'].onclick, null);
    assert.match(e['ad-banner-carousel'].innerHTML, /첫 광고/);
    assert.match(e['ad-banner-carousel'].innerHTML, /src="\/first.png"/);
    assert.deepEqual(h.tasks('interval').map(task => task.delay).sort(), [3000, 3500]);
    h.view.stop();
});

test('광고는 500ms 전환 뒤 바뀌고 네 개의 대기 문구는 처음으로 순환한다', () => {
    const h = harness();
    h.view.showLoading();
    h.fire(h.tasks('frame')[0]);
    assert.equal(h.elements['ad-banner-carousel'].querySelector('.ad-banner').classList.contains('fade-in'), true);
    h.fire(h.tasks('interval', 3500)[0]);
    assert.equal(h.elements['ad-banner-carousel'].querySelector('.ad-banner').classList.contains('fade-out'), true);
    assert.match(h.elements['ad-banner-carousel'].innerHTML, /첫 광고/);
    h.fire(h.tasks('timeout', 500)[0]);
    assert.match(h.elements['ad-banner-carousel'].innerHTML, /두 번째 광고/);
    const messageTimer = h.tasks('interval', 3000)[0];
    const messages = [];
    for (let i = 0; i < 4; i++) {
        h.fire(messageTimer);
        messages.push(h.elements['loading-subtext'].textContent);
    }
    assert.deepEqual(messages, [
        '추천 장소 간의 이동 동선을 계산하는 중입니다',
        '방문 시간에 맞춰 일정을 최적화하고 있습니다',
        '거의 다 준비되었습니다! 조금만 더 기다려주세요',
        'AI가 최적의 여행 장소를 탐색하고 있습니다',
    ]);
    h.view.stop();
});

test('완료 화면은 모든 애니메이션을 정리하고 결과 버튼을 유지한다', () => {
    const h = harness();
    let continued = 0;
    h.view.showLoading();
    h.fire(h.tasks('interval', 3500)[0]);
    h.view.showSuccess(() => continued++);
    const e = h.elements;
    assert.equal(e['loading-spinner'].style.display, 'none');
    assert.equal(e['loading-text'].textContent, '번역:planReadyText');
    assert.equal(e['loading-subtext'].style.display, 'none');
    assert.equal(e['loading-subtext'].classList.contains('loading-text-fade'), false);
    assert.equal(e['show-results-btn'].style.display, 'inline-block');
    assert.equal(e['show-results-btn'].textContent, '번역:showResultsBtn');
    assert.equal(e['ad-banner-carousel'].style.display, 'none');
    assert.equal(e['ad-banner-carousel'].innerHTML, '');
    assert.equal(h.pending.size, 0);
    h.view.stop();
    e['show-results-btn'].onclick();
    assert.equal(continued, 1, '추가 정리는 결과 버튼 동작을 지우지 않는다');
});

test('실패 화면은 오류를 표시하고 돌아가기 동작은 호출자에게 맡긴다', () => {
    const h = harness();
    let backed = 0;
    h.view.showLoading();
    h.view.showError(new Error('네트워크 오류'), () => backed++);
    const e = h.elements;
    assert.equal(e['loading-spinner'].style.display, 'none');
    assert.equal(e['loading-text'].textContent, '번역:planFailedText');
    assert.equal(e['loading-text'].dataset.tone, 'danger');
    assert.equal(e['loading-subtext'].textContent, '네트워크 오류');
    assert.equal(e['loading-subtext'].style.display, 'block');
    assert.equal(e['show-results-btn'].textContent, '번역:goBackBtn');
    assert.equal(e['show-results-btn'].style.display, 'inline-block');
    assert.equal(h.pending.size, 0);
    e['show-results-btn'].onclick();
    assert.equal(backed, 1);
    assert.equal(e['loading-transition-view'].style.display, 'flex');
    h.view.showError({}, () => {});
    assert.equal(e['loading-subtext'].textContent, '번역:tryAgainText');
});

test('폼 복귀는 대기 화면·타이머·이전 버튼 콜백을 정리한다', () => {
    const h = harness();
    h.view.showLoading();
    h.view.showError(new Error('실패'), () => h.view.showForm());
    h.elements['show-results-btn'].onclick();
    assert.equal(h.elements['travel-form-view'].style.display, 'block');
    assert.equal(h.elements['travel-form-view'].classList.contains('hidden-view'), false);
    assert.equal(h.elements['loading-transition-view'].style.display, 'none');
    assert.equal(h.elements['loading-transition-view'].classList.contains('hidden-view'), true);
    assert.equal(h.elements['show-results-btn'].onclick, null);
    assert.equal(h.pending.size, 0);
});

test('재시도 안내는 대기 중에만 표시하고 새 생성에서는 원래 문구로 초기화한다', () => {
    const h = harness();
    h.view.showLoading();
    h.view.showRetry('잠시 뒤 다시 시도합니다');
    assert.equal(h.elements['loading-text'].textContent, '잠시 뒤 다시 시도합니다');
    assert.equal(h.elements['loading-text'].dataset.tone, 'warn');
    h.view.showSuccess(() => {});
    h.view.showRetry('늦게 도착한 재시도');
    assert.equal(h.elements['loading-text'].textContent, '번역:planReadyText');
    h.view.showLoading();
    assert.equal(h.elements['loading-text'].textContent, '번역:loadingText');
    assert.equal(h.elements['loading-text'].dataset.tone, undefined);
    h.view.stop();
});

test('정지 뒤 이미 큐에 들어간 interval·timeout·frame은 화면을 되살리지 않는다', () => {
    const h = harness();
    h.view.showLoading();
    h.fire(h.tasks('interval', 3500)[0]);
    const oldTasks = [...h.pending.values()];
    assert.ok(oldTasks.some(task => task.kind === 'timeout'));
    assert.ok(oldTasks.some(task => task.kind === 'frame'));
    h.view.showError(new Error('확정된 오류'), () => {});
    for (const task of oldTasks) task.callback();
    assert.equal(h.elements['loading-subtext'].textContent, '확정된 오류');
    assert.equal(h.elements['ad-banner-carousel'].innerHTML, '');
    assert.equal(h.elements['ad-banner-carousel'].style.display, 'none');
    assert.equal(h.pending.size, 0);
});

test('재시작은 타이머를 중복시키지 않고 이전 콜백이 새 광고와 문구를 바꾸지 못한다', () => {
    const h = harness();
    h.view.showLoading();
    h.fire(h.tasks('interval', 3500)[0]);
    const oldTasks = [...h.pending.values()];
    h.view.showLoading();
    const currentTasks = [...h.pending.keys()];
    for (const task of oldTasks) task.callback();
    assert.deepEqual([...h.pending.keys()], currentTasks);
    assert.equal(h.tasks('interval').length, 2);
    assert.equal(h.tasks('frame').length, 1);
    assert.equal(h.tasks('timeout').length, 0);
    assert.match(h.elements['ad-banner-carousel'].innerHTML, /첫 광고/);
    assert.equal(h.elements['ad-banner-carousel'].querySelector('.ad-banner').classList.contains('fade-in'), false);
    assert.equal(h.elements['loading-subtext'].textContent, 'AI가 최적의 여행 장소를 탐색하고 있습니다');
    h.view.stop();
    assert.equal(h.pending.size, 0);
});

test('광고 설정이 비어 있으면 빈 배너와 불필요한 광고 타이머를 만들지 않는다', () => {
    const h = harness({ ads: [] });
    h.view.showLoading();
    assert.equal(h.elements['ad-banner-carousel'].style.display, 'none');
    assert.equal(h.elements['ad-banner-carousel'].innerHTML, '');
    assert.deepEqual(h.tasks('interval').map(task => task.delay), [3000]);
    assert.equal(h.tasks('frame').length, 0);
    h.view.stop();
});

test('생성 조정자와 실제 진행 화면을 연결해도 이탈 전 응답과 광고가 새 결과를 덮지 않는다', async () => {
    const h = harness();
    const context = { userId: 'owner', path: '/plan' };
    const jobs = [];
    const applied = [];
    const navigations = [];
    let completed = 0;
    const controller = createGenerationController({
        getContext: () => context,
        generate: () => new Promise(resolve => jobs.push(resolve)),
        view: h.view,
        clearResults() {},
        applyResult: result => applied.push(result),
        navigate: path => navigations.push(path),
        onComplete: () => completed++,
        notifyError: () => assert.fail('예상하지 않은 오류 안내'),
    });

    controller.enterPlan();
    const first = controller.start({ city: '서울' });
    h.fire(h.tasks('interval', 3500)[0]);
    const queued = [...h.pending.values()];
    context.path = '/share/abc';
    controller.syncContext();
    assert.equal(h.pending.size, 0);
    assert.equal(completed, 1);

    context.path = '/plan';
    controller.enterPlan();
    const second = controller.start({ city: '부산' });
    // 같은 경로의 인증 재평가는 실제 로딩 UI도 유지한다.
    controller.syncContext();
    controller.enterPlan();
    assert.equal(h.elements['travel-form-view'].style.display, 'none');
    assert.equal(h.elements['loading-transition-view'].style.display, 'flex');
    jobs[1]({ city: '부산' });
    assert.equal(await second, 'success');
    jobs[0]({ city: '서울' });
    assert.equal(await first, 'stale');
    for (const task of queued) task.callback();

    assert.deepEqual(applied, [{ city: '부산' }]);
    assert.equal(completed, 2);
    assert.equal(h.pending.size, 0);
    assert.equal(h.elements['ad-banner-carousel'].innerHTML, '');
    assert.equal(h.elements['loading-text'].textContent, '번역:planReadyText');
    assert.equal(h.elements['show-results-btn'].style.display, 'inline-block');
    assert.deepEqual(navigations, []);
    h.elements['show-results-btn'].onclick();
    assert.deepEqual(navigations, ['/view']);
});
