// Run after refactor-smoke-setup.js. Real router, DOM and html2canvas; no external sharing.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  check(page.url().startsWith((page.smokeOrigin || 'http://127.0.0.1:4173') + '/'), 'Local harness required');
  check(await page.evaluate(() => !!window.__smoke), 'Run the isolated smoke setup first');
  const results = [];
  await page.evaluate(() => {
    document.querySelector('itinerary-view').showResults({ days: [{ date: '2026-10-20', scheduleItems: [
      { type: 'departure', title: '서울역', location: '서울역', time: '09:00' },
      { type: 'AnchorSchedule', title: '경복궁 산책', location: '경복궁', time: '10:00', endTime: '11:00' },
      { type: 'arrival', title: '호텔', location: '호텔', time: '18:00' },
    ] }] });
    window.navigate('/view');
    window.__exportTheme = { mutations: [] };
    const state = window.__exportTheme;
    state.snapshot = () => ({
      theme: document.documentElement.getAttribute('data-theme'),
      route: document.documentElement.getAttribute('data-route-theme'),
      dark: document.body.classList.contains('dark'),
      paper: getComputedStyle(document.documentElement).getPropertyValue('--cp-paper').trim(),
      metas: [...document.querySelectorAll('meta[name="theme-color"]')].map(meta => meta.content),
    });
    state.observer = new MutationObserver(records => state.mutations.push(...records.map(record => record.attributeName)));
    state.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-route-theme'] });
    state.observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: payload => new Promise((resolve, reject) => {
      state.file = payload.files[0];
      state.finish = cancelled => cancelled ? reject(new DOMException('Cancelled', 'AbortError')) : resolve();
    }) });
  });
  await page.locator('itinerary-view #download-image-btn').waitFor({ state: 'visible' });
  const theme = () => page.evaluate(() => window.__exportTheme.snapshot());
  const clean = () => page.evaluate(() => !document.querySelector('body > div[aria-hidden="true"] .bp') && !document.querySelector('.html2canvas-container'));
  const before = await theme();
  check(before.route === 'dark', 'Begin on the dark result route; rerun setup for an isolated test');
  await page.locator('itinerary-view #download-image-btn').click();
  await page.waitForFunction(() => !!window.__exportTheme.finish);
  check(JSON.stringify(await theme()) === JSON.stringify(before), 'Real capture must not change the current route/theme/meta colors');
  check((await page.evaluate(() => window.__exportTheme.mutations)).length === 0, 'Even temporary live theme changes are forbidden');
  check(await clean(), 'Temporary capture DOM must be removed before the share sheet finishes');
  const pixels = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(window.__exportTheme.file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
    const background = [...ctx.getImageData(20, 20, 1, 1).data];
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 80 && data[i + 1] < 80 && data[i + 2] < 80 && data[i + 3] > 240) ink++;
    bitmap.close();
    return { width: canvas.width, height: canvas.height, background, ink };
  });
  check(pixels.width === 1440 && pixels.height > 500, 'PNG dimensions must preserve the 720px ticket at 2x');
  check(JSON.stringify(pixels.background) === '[255,255,255,255]' && pixels.ink > 1000, 'PNG must retain a light opaque paper and visible dark content');
  results.push({ check: 'real PNG/light palette/no live-theme mutation/early cleanup', pixels });

  await page.evaluate(() => window.navigate('/profile/personal'));
  await page.locator('#page-profile').waitFor({ state: 'visible' });
  const profileTheme = await theme();
  await page.evaluate(() => window.__exportTheme.finish(true));
  await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.querySelector('#download-image-btn').disabled);
  check(JSON.stringify(await theme()) === JSON.stringify(profileTheme), 'Cancelled share must not restore /view dark theme over profile');
  results.push({ check: 'navigation while sharing/cancel/profile theme preserved' });

  await page.evaluate(() => { window.__exportTheme.finish = null; window.navigate('/view'); });
  await page.locator('itinerary-view #download-image-btn').click();
  await page.waitForFunction(() => !!window.__exportTheme.finish);
  await page.locator('#theme-toggle').click();
  const chosenTheme = await theme();
  await page.evaluate(() => window.__exportTheme.finish(false));
  await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.querySelector('#download-image-btn').disabled);
  check(JSON.stringify(await theme()) === JSON.stringify(chosenTheme), 'Share success must not undo the user theme choice');
  check(await clean(), 'Share success must not leak capture DOM');
  results.push({ check: 'theme toggle while sharing/success/user choice preserved' });

  await page.evaluate(() => { window.__exportTheme.observer.disconnect(); Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }); });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBefore = await theme();
  const downloading = page.waitForEvent('download');
  await page.locator('itinerary-view #download-image-btn').click();
  const download = await downloading;
  if (page.exportThemeOutputDir) await download.saveAs(page.exportThemeOutputDir + '/ticket.png');
  await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.querySelector('#download-image-btn').disabled);
  check(JSON.stringify(await theme()) === JSON.stringify(mobileBefore), 'Mobile download must leave the current theme unchanged');
  check(await clean(), 'Mobile capture must not leak temporary DOM');
  results.push({ check: 'mobile-width download/theme/cleanup', filename: download.suggestedFilename() });
  check(page.smokeErrors.length === 0, 'Unexpected page errors: ' + page.smokeErrors.join(','));
  return { results, errors: page.smokeErrors };
}
