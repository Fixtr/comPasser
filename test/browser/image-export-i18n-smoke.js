// Run after refactor-smoke-setup.js. Real translations, router, ticket DOM and PNG capture.
// Native sharing is faked; optional page.exportI18nOutputDir retains actual downloaded PNGs.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  check(page.url().startsWith((page.smokeOrigin || 'http://127.0.0.1:4173') + '/'), 'Local harness required');
  check(await page.evaluate(() => !!window.__smoke), 'Run the isolated smoke setup first');
  const copy = {
    ko: { busy: '이미지 만드는 중...', idle: '티켓 이미지로 저장·공유', badge: '확정',
      totals: ['이동', '1인 비용'], shared: '티켓을 공유했습니다.', saved: '티켓 이미지를 저장했습니다.' },
    en: { busy: 'Creating image...', idle: 'Save or share as a ticket image', badge: 'FIXED',
      totals: ['Travel time', 'Cost per person'], shared: 'Ticket image shared.', saved: 'Ticket image saved.' },
  };
  const previousLang = await page.evaluate(async () => (await import('/src/utils/i18n.js')).getLang());
  const previousViewport = page.viewportSize();
  const results = [];
  await page.evaluate(() => {
    const state = window.__exportI18n = { tickets: [], finish: null, file: null };
    state.originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
    state.originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    state.observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        const ticket = node.querySelector?.('.bp');
        if (!ticket) continue;
        const labels = [...ticket.querySelectorAll('.bp-row-fixed, .bp-total-label')];
        state.tickets.push({
          badge: ticket.querySelector('.bp-row-fixed')?.textContent,
          totals: [...ticket.querySelectorAll('.bp-total-label')].map(el => el.textContent),
          overflow: labels.some(el => el.scrollWidth > el.clientWidth + 1),
          text: ticket.textContent,
        });
      }
    });
    state.observer.observe(document.body, { childList: true });
    document.querySelector('itinerary-view').showResults({ days: [{ date: '2026-10-20', scheduleItems: [
      { type: 'departure', title: '서울역', location: '서울역', time: '09:00' },
      { type: 'AnchorSchedule', title: '경복궁 산책', location: '경복궁', time: '10:00', endTime: '11:00',
        transitInfo: '지하철 20분 · 3km', practicalInfo: { estimatedCost: '3,000원' } },
      { type: 'arrival', title: '호텔', location: '호텔', time: '18:00' },
    ] }] });
    window.navigate('/view');
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: payload => new Promise((resolve, reject) => {
      state.file = payload.files[0];
      state.finish = cancelled => cancelled ? reject(new DOMException('Cancelled', 'AbortError')) : resolve();
    }) });
  });
  const button = page.locator('itinerary-view #download-image-btn');
  const prepare = lang => page.evaluate(async lang => {
    (await import('/src/utils/i18n.js')).setLang(lang);
    window.__exportI18n.tickets = []; window.__exportI18n.finish = null;
    document.getElementById('app-toast-container')?.replaceChildren();
  }, lang);
  const ticketCheck = async lang => {
    const tickets = await page.evaluate(() => window.__exportI18n.tickets);
    check(tickets.length === 1, 'Exactly one ticket must be captured');
    const ticket = tickets[0];
    check(ticket.badge === copy[lang].badge, lang + ': fixed badge must be translated');
    check(JSON.stringify(ticket.totals) === JSON.stringify(copy[lang].totals), lang + ': total labels must be translated');
    check(!ticket.overflow, lang + ': ticket labels must fit');
    check(!/anchorBadge|transitTotalLabel|costLabel/.test(ticket.text), 'No raw translation keys in ticket');
    check(await page.evaluate(() => !document.querySelector('body > div[aria-hidden="true"] .bp') && !document.querySelector('.html2canvas-container')), 'Capture DOM must be cleaned up');
    return ticket;
  };
  try {
    for (const lang of ['ko', 'en']) {
      await prepare(lang);
      await button.click();
      await page.waitForFunction(() => !!window.__exportI18n.finish);
      check(await button.textContent() === copy[lang].busy && await button.isDisabled(), 'Translated busy state required');
      const ticket = await ticketCheck(lang);
      const nextLang = lang === 'ko' ? 'en' : 'ko';
      await page.locator('#lang-toggle').click();
      check(await button.textContent() === copy[nextLang].busy && await button.isDisabled(), 'Language switch must preserve translated busy state');
      const cancelled = lang === 'en';
      await page.evaluate(cancelled => window.__exportI18n.finish(cancelled), cancelled);
      await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.querySelector('#download-image-btn').disabled);
      check(await button.textContent() === copy[nextLang].idle, 'Completion must use the current language');
      if (cancelled) check(await page.locator('#app-toast-container .app-toast').count() === 0, 'Cancellation must not announce success');
      else check(await page.locator('#app-toast-container .app-toast').last().textContent() === copy[nextLang].shared, 'Success toast must use the current language');
      results.push({ check: lang + ' ticket / language switch / ' + (cancelled ? 'cancel' : 'share success'), ticket });
    }
    await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }));
    await page.setViewportSize({ width: 390, height: 844 });
    for (const lang of ['ko', 'en']) {
      await prepare(lang);
      const downloading = page.waitForEvent('download');
      await button.click();
      const download = await downloading;
      if (page.exportI18nOutputDir) await download.saveAs(page.exportI18nOutputDir + '/ticket-' + lang + '.png');
      await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.querySelector('#download-image-btn').disabled);
      const ticket = await ticketCheck(lang);
      check(await button.textContent() === copy[lang].idle, 'Download must restore translated button');
      check(await page.locator('#app-toast-container .app-toast').last().textContent() === copy[lang].saved, 'Download toast must be translated');
      results.push({ check: lang + ' mobile download / PNG labels / success toast', ticket, filename: download.suggestedFilename() });
    }
    check(page.smokeErrors.length === 0, 'Unexpected page errors: ' + page.smokeErrors.join(','));
    return { results, errors: page.smokeErrors };
  } finally {
    await page.evaluate(async lang => {
      const state = window.__exportI18n;
      state.observer.disconnect();
      for (const [key, descriptor] of [['canShare', state.originalCanShare], ['share', state.originalShare]]) {
        if (descriptor) Object.defineProperty(navigator, key, descriptor);
        else delete navigator[key];
      }
      (await import('/src/utils/i18n.js')).setLang(lang);
    }, previousLang);
    if (previousViewport) await page.setViewportSize(previousViewport);
  }
}
