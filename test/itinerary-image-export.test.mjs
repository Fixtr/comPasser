import test from 'node:test';
import assert from 'node:assert/strict';

import { createItineraryImageExporter } from '../src/domains/itinerary/ui/itinerary-image-export.js';

const plan = () => ({ days: [
  { date: '2026-09-08', scheduleItems: [
    { type: 'Sightseeing', title: '첫날 방문지', location: '서울', time: '10:00' },
  ] },
  { date: '2026-09-09', scheduleItems: [
    { type: 'departure', title: '출발', location: '부산역', time: '09:00' },
    { type: 'AnchorSchedule', title: '둘째 날 방문지', location: '해운대', time: '10:00',
      transitInfo: '1시간 10분', practicalInfo: { estimatedCost: '미정' } },
    { type: 'arrival', title: '도착', location: '호텔', time: '18:00' },
  ] },
] });

function element(tagName) {
  const attributes = new Map();
  const classes = new Set();
  return {
    tagName, attributes, classes, children: [], parentNode: null, style: {},
    classList: {
      contains: name => classes.has(name),
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle(name, force) {
        const add = force ?? !classes.has(name);
        if (add) classes.add(name); else classes.delete(name);
        return add;
      },
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute: name => attributes.get(name) ?? null,
    hasAttribute: name => attributes.has(name),
    removeAttribute(name) { attributes.delete(name); },
    append(...nodes) {
      for (const node of nodes) {
        node.remove();
        node.parentNode = this;
        this.children.push(node);
      }
    },
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter(node => node !== this);
      this.parentNode = null;
    },
    contains(node) { return node === this || this.children.some(child => child.contains(node)); },
  };
}

function harness(options = {}) {
  const body = element('body');
  const root = element('html');
  body.classList.add('unrelated-class');
  if (options.dark ?? true) body.classList.add('dark');
  if (options.theme !== null) root.setAttribute('data-theme', options.theme ?? 'dark');
  if (options.routeTheme !== null) root.setAttribute('data-route-theme', options.routeTheme ?? 'dark');
  const existingContent = element('main');
  body.append(existingContent);
  const calls = { render: [], capture: [], share: [], canShare: [], clicks: [], urls: [], revoked: [], loads: 0 };
  const blob = new Blob(['image bytes'], { type: 'image/png' });
  const themes = () => ({
    classes: [...body.classes].sort(),
    theme: root.getAttribute('data-theme'),
    routeTheme: root.getAttribute('data-route-theme'),
  });
  const originalTheme = themes();
  const document = {
    body, documentElement: root,
    createElement(tagName) {
      const node = element(tagName);
      if (tagName === 'a') node.click = () => {
        calls.clicks.push({ href: node.href, download: node.download });
        if (options.clickError) throw options.clickError;
      };
      return node;
    },
  };
  const browser = {
    document,
    navigator: {},
    File: class {
      constructor(parts, name, metadata) { Object.assign(this, { parts, name, ...metadata }); }
    },
    URL: {
      createObjectURL(value) { calls.urls.push(value); return 'blob:ticket'; },
      revokeObjectURL(url) { calls.revoked.push(url); },
    },
  };
  if (options.native) {
    browser.navigator.canShare = value => {
      calls.canShare.push(value);
      return options.canShare ?? true;
    };
    browser.navigator.share = async value => {
      calls.share.push(value);
      await options.waitAt?.('share');
      if (options.shareError) throw options.shareError;
    };
  }
  const exportImage = createItineraryImageExporter({
    browser,
    renderTicket(pass, labels) {
      calls.render.push({ pass, labels });
      return element('article');
    },
    async loadCanvas() {
      calls.loads++;
      await options.waitAt?.('load');
      if (options.loadError) throw options.loadError;
      return async (ticket, captureOptions) => {
        // The capture engine passes a different document to onclone.
        const clonedRoot = element('html');
        const clonedBody = element('body');
        for (const [name, value] of root.attributes) clonedRoot.setAttribute(name, value);
        for (const name of body.classes) clonedBody.classList.add(name);
        captureOptions.onclone?.({ documentElement: clonedRoot, body: clonedBody });
        calls.capture.push({ ticket, options: captureOptions, theme: themes(), mounted: body.contains(ticket),
          cloneTheme: { dark: clonedBody.classList.contains('dark'), theme: clonedRoot.getAttribute('data-theme'), routeTheme: clonedRoot.getAttribute('data-route-theme') } });
        await options.waitAt?.('capture');
        if (options.captureError) throw options.captureError;
        return {
          toBlob(callback, mimeType) {
            assert.equal(mimeType, 'image/png');
            if (options.encodingError) throw options.encodingError;
            const waiting = options.waitAt?.('encode');
            if (waiting) waiting.then(() => callback(options.nullBlob ? null : blob));
            else callback(options.nullBlob ? null : blob);
          },
        };
      };
    },
  });
  return {
    exportImage, calls, blob, browser, themes, originalTheme,
    assertClean(expectedTheme = originalTheme) {
      assert.deepEqual(themes(), expectedTheme, '현재 화면의 테마와 무관한 클래스를 변경하지 않는다');
      assert.deepEqual(body.children, [existingContent], '앱 내용은 남기고 캡처용 임시 화면만 제거한다');
      assert.equal(calls.revoked.length, calls.urls.length, '만든 이미지 URL은 모두 해제한다');
    },
  };
}

test('빈 일정이나 선택한 날에 방문지가 없으면 캡처와 공유를 시작하지 않는다', async () => {
  const h = harness();
  for (const input of [
    { plan: null },
    { plan: { days: [] } },
    { plan: { days: [{ scheduleItems: [] }] } },
    { plan: plan(), dayIndex: 99 },
  ]) assert.equal(await h.exportImage(input), 'empty');
  assert.equal(h.calls.loads, 0);
  assert.equal(h.calls.render.length, 0);
  assert.equal(h.calls.clicks.length, 0);
  h.assertClean();
});

test('선택한 날짜와 번역으로 티켓을 만들고 입력 일정은 변경하지 않는다', async () => {
  const h = harness({ theme: null, routeTheme: 'custom-route' });
  const input = plan();
  const before = structuredClone(input);
  const labels = { fixedLabel: 'FIXED', transitLabel: 'Transit', costLabel: 'Cost' };
  assert.equal(await h.exportImage({ plan: input, dayIndex: 1, language: 'en', labels }), 'downloaded');
  const { pass, labels: renderedLabels } = h.calls.render[0];
  assert.equal(pass.dayLabel, 'DAY 2');
  assert.equal(pass.dateLabel, '2026.09.09');
  assert.equal(pass.route, '09/08–09/09 · 2 days');
  assert.equal(pass.from, '부산역');
  assert.equal(pass.to, '호텔');
  assert.deepEqual(pass.rows.map(row => row.name), ['둘째 날 방문지']);
  assert.equal(pass.transit, '1h 10m');
  for (const [key, value] of Object.entries(labels)) assert.equal(renderedLabels[key], value);
  assert.equal(renderedLabels.moreLabel(3), '+ 3 more');
  assert.deepEqual(input, before);
  assert.deepEqual(h.calls.clicks, [{ href: 'blob:ticket', download: 'compasser-CP-260909-2.png' }]);
  assert.equal(h.calls.capture[0].mounted, true);
  assert.deepEqual(h.calls.capture[0].theme, h.originalTheme);
  assert.deepEqual(h.calls.capture[0].cloneTheme, { dark: false, theme: 'light', routeTheme: null });
  assert.equal(h.calls.capture[0].options.backgroundColor, null, '배경은 복제 티켓의 라이트 토큰으로 그린다');
  assert.equal(h.calls.capture[0].options.scale, 2);
  h.assertClean();
});

test('기기 공유가 성공하면 PNG 파일과 일정 설명을 전달하고 다운로드하지 않는다', async () => {
  const h = harness({ native: true });
  assert.equal(await h.exportImage({ plan: plan(), dayIndex: 1 }), 'shared');
  const payload = h.calls.share[0];
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0].name, 'compasser-CP-260909-2.png');
  assert.equal(payload.files[0].type, 'image/png');
  assert.deepEqual(payload.files[0].parts, [h.blob]);
  assert.equal(payload.title, '9월 8일~9월 9일 · 1박 2일');
  assert.equal(payload.text, 'DAY 2 · 부산역 → 호텔');
  assert.equal(h.calls.urls.length, 0);
  assert.equal(h.calls.clicks.length, 0);
  h.assertClean();
});

test('사용자가 공유를 취소하면 성공이나 다운로드로 바꾸지 않고 정리한다', async () => {
  const h = harness({ native: true, shareError: new DOMException('사용자 취소', 'AbortError') });
  assert.equal(await h.exportImage({ plan: plan() }), 'cancelled');
  assert.equal(h.calls.share.length, 1);
  assert.equal(h.calls.urls.length, 0);
  assert.equal(h.calls.clicks.length, 0);
  h.assertClean();
});

test('기기에서 파일 공유를 지원하지 않으면 PNG 다운로드로 전환한다', async () => {
  const h = harness({ native: true, canShare: false });
  assert.equal(await h.exportImage({ plan: plan() }), 'downloaded');
  assert.equal(h.calls.canShare.length, 1);
  assert.equal(h.calls.share.length, 0);
  assert.deepEqual(h.calls.urls, [h.blob]);
  assert.deepEqual(h.calls.revoked, ['blob:ticket']);
  h.assertClean();
});

test('공유 권한 오류는 캡처 오류로 취급하지 않고 다운로드로 전환한다', async () => {
  const h = harness({ native: true, shareError: new DOMException('제스처 만료', 'NotAllowedError') });
  assert.equal(await h.exportImage({ plan: plan() }), 'downloaded');
  assert.equal(h.calls.share.length, 1);
  assert.equal(h.calls.clicks.length, 1);
  h.assertClean();
});

test('캡처 실패를 호출자에게 전달하며 원본 테마 값은 건드리지 않는다', async () => {
  const error = new Error('capture failed');
  for (const theme of [
    { dark: true, theme: null, routeTheme: null },
    { dark: false, theme: 'dark', routeTheme: 'dark' },
    { dark: false, theme: '', routeTheme: '' },
    { dark: false, theme: 'light', routeTheme: null },
  ]) {
    const h = harness({ ...theme, captureError: error });
    await assert.rejects(h.exportImage({ plan: plan() }), thrown => thrown === error);
    assert.equal(h.calls.share.length, 0);
    assert.equal(h.calls.clicks.length, 0);
    h.assertClean();
  }
});

test('캡처 엔진을 불러오지 못해도 임시 화면을 제거하고 테마는 유지한다', async () => {
  const error = new Error('engine load failed');
  const h = harness({ loadError: error });
  await assert.rejects(h.exportImage({ plan: plan() }), thrown => thrown === error);
  assert.equal(h.calls.capture.length, 0);
  h.assertClean();
});

test('PNG 인코딩 결과가 없으면 빈 파일을 공유하거나 다운로드하지 않는다', async () => {
  const h = harness({ native: true, nullBlob: true });
  await assert.rejects(h.exportImage({ plan: plan() }));
  assert.equal(h.calls.share.length, 0);
  assert.equal(h.calls.urls.length, 0);
  assert.equal(h.calls.clicks.length, 0);
  h.assertClean();
});

test('PNG 인코딩 예외도 호출자에게 전달하고 캡처 자원을 정리한다', async () => {
  const error = new Error('encoding failed');
  const h = harness({ encodingError: error });
  await assert.rejects(h.exportImage({ plan: plan() }), thrown => thrown === error);
  assert.equal(h.calls.urls.length, 0);
  h.assertClean();
});

test('다운로드 클릭이 실패해도 이미지 URL을 해제하고 테마를 유지한다', async () => {
  const error = new Error('download failed');
  const h = harness({ clickError: error });
  await assert.rejects(h.exportImage({ plan: plan() }), thrown => thrown === error);
  assert.deepEqual(h.calls.urls, [h.blob]);
  assert.deepEqual(h.calls.revoked, ['blob:ticket']);
  h.assertClean();
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

for (const phase of ['load', 'capture', 'encode', 'share']) {
  for (const fails of [false, true]) {
    test(`${phase} 대기 중 화면·테마 변경을 ${fails ? '실패/취소' : '완료'} 후에도 유지한다`, async () => {
      const entered = deferred();
      const finish = deferred();
      const error = new Error('delayed failure');
      const h = harness({ native: true,
        waitAt(point) { if (point === phase) { entered.resolve(); return finish.promise; } },
        loadError: fails && phase === 'load' ? error : null,
        captureError: fails && phase === 'capture' ? error : null,
        nullBlob: fails && phase === 'encode',
        shareError: fails && phase === 'share' ? new DOMException('취소', 'AbortError') : null,
      });
      const exporting = h.exportImage({ plan: plan() });
      const settled = exporting.then(result => ({ result }), caught => ({ error: caught }));
      await entered.promise;
      assert.deepEqual(h.themes(), h.originalTheme, '캡처/공유 대기 중에도 실제 화면을 밝게 바꾸지 않는다');
      if (phase === 'share' || phase === 'encode') {
        assert.equal(h.browser.document.body.children.length, 1, '캡처가 끝나면 공유 전에 임시 티켓을 제거한다');
      }
      const { body, documentElement: root } = h.browser.document;
      body.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.removeAttribute('data-route-theme');
      const currentTheme = h.themes();
      finish.resolve();
      const outcome = await settled;
      if (fails && phase !== 'share') assert.ok(outcome.error);
      else assert.equal(outcome.result, fails ? 'cancelled' : 'shared');
      h.assertClean(currentTheme);
    });
  }
}

test('동시 내보내기를 역순으로 끝내도 서로의 자원이나 최신 테마를 복원하지 않는다', async () => {
  const gates = [deferred(), deferred()];
  const bothSharing = deferred();
  let sharing = 0;
  const h = harness({ native: true, waitAt(phase) {
    if (phase !== 'share') return;
    const gate = gates[sharing++];
    if (sharing === 2) bothSharing.resolve();
    return gate.promise;
  } });
  const first = h.exportImage({ plan: plan() });
  const second = h.exportImage({ plan: plan(), dayIndex: 1 });
  await bothSharing.promise;
  h.assertClean();
  h.browser.document.documentElement.removeAttribute('data-route-theme');
  const currentTheme = h.themes();
  gates[1].resolve();
  assert.equal(await second, 'shared');
  h.assertClean(currentTheme);
  gates[0].resolve();
  assert.equal(await first, 'shared');
  h.assertClean(currentTheme);
});
