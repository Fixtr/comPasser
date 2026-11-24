// 스펙 9: the web shell loads gtag only with a measurement ID, sends masked page views, and a Capacitor app loads nothing.
// No request leaves the machine: the script URL is answered here and the queue (window.dataLayer) is read instead.
async page => {
  const requests = [];
  await page.route(/^https:\/\/www\.googletagmanager\.com\//, route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: '' });
  });
  const home = () => page.locator('ion-app').waitFor();
  const settle = () => page.waitForTimeout(300);

  // The isolated server has no measurement ID: nothing is loaded and nothing is queued.
  await page.goto(page.smokeOrigin + '/home');
  await home();
  await settle();
  if (requests.length || await page.evaluate(() => 'gtag' in window || 'dataLayer' in window)) throw Error('Analytics started without a measurement ID');

  // With an ID (an obviously fake one, put into the served module the way map-leg-smoke injects the maps key).
  let injected = false;
  await page.route(/\/src\/utils\/analytics\.js/, async route => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.replace('import.meta.env.VITE_GA_MEASUREMENT_ID', '"G-TEST000000"');
    injected = body !== source;
    await route.fulfill({ response, body });
  });
  const queue = () => page.evaluate(() => (window.dataLayer || []).map(entry => Array.from(entry)));
  const pageViews = async () => (await queue()).filter(entry => entry[1] === 'page_view').map(entry => entry[2]);
  const waitViews = async count => {
    for (let tries = 0; tries < 100 && (await pageViews()).length < count; tries++) await page.waitForTimeout(50);
    return pageViews();
  };
  const go = path => page.evaluate(path => window.navigate(path), path);

  await page.goto(page.smokeOrigin + '/share/SECRETshare1?utm=SECRETquery#SECREThash');
  await waitViews(1);
  if (!injected) throw Error('The measurement ID was not injected');
  const tag = await page.evaluate(() => {
    const script = document.querySelector('script[src^="https://www.googletagmanager.com/"]');
    return script && { src: script.src, async: script.async, inHead: script.parentNode === document.head };
  });
  if (requests.join() !== 'https://www.googletagmanager.com/gtag/js?id=G-TEST000000' || tag?.src !== requests[0] || !tag.async || !tag.inHead) throw Error('gtag was not loaded once, async: ' + JSON.stringify([requests, tag]));
  const start = (await queue()).slice(0, 2);
  if (start[0][0] !== 'js' || JSON.stringify(start[1]) !== JSON.stringify(['config', 'G-TEST000000', { send_page_view: false }])) throw Error('gtag config wrong: ' + JSON.stringify(start));

  await go('/verify?mode=resetPassword&oobCode=SECREToob');
  await waitViews(2);
  await go('/account-deletion-status?receipt=SECRETreceipt');
  await waitViews(3);
  await go('/nope/SECRETpath');
  const views = await waitViews(4);
  const origin = page.smokeOrigin;
  const expected = ['/share/:id', '/verify', '/account-deletion-status', '/not-found'].map((page_path, index, paths) => ({
    page_location: origin + page_path, page_referrer: index ? origin + paths[index - 1] : '', page_path }));
  if (JSON.stringify(views) !== JSON.stringify(expected)) throw Error('Masked page views wrong: ' + JSON.stringify(views));
  // Each page view is preceded by a `set`, so later events do not fall back to the real address.
  const sets = (await queue()).filter(entry => entry[0] === 'set').map(entry => entry[1].page_location);
  if (sets.join() !== expected.map(view => view.page_location).join()) throw Error('page_location was not set for later events: ' + sets);
  const sent = JSON.stringify(await queue());
  if (/SECRET|[?#]/.test(sent.replace(/\?id=G-TEST000000/g, ''))) throw Error('An id, token, query or hash reached analytics: ' + sent);
  if (requests.length !== 1) throw Error('gtag was requested again on navigation');

  // A blocked script leaves the app working.
  await page.unroute(/^https:\/\/www\.googletagmanager\.com\//);
  await page.route(/^https:\/\/www\.googletagmanager\.com\//, route => route.abort('blockedbyclient'));
  const failures = page.smokeErrors.length;
  await page.goto(page.smokeOrigin + '/home');
  await waitViews(1);
  await settle();
  await go('/courses');
  await page.waitForURL('**/courses');
  if (page.smokeErrors.length !== failures) throw Error('A blocked analytics script raised an error: ' + page.smokeErrors.slice(failures));
  if ((await waitViews(2)).map(view => view.page_path).join() !== '/home,/courses') throw Error('The app stopped navigating after a blocked script');

  // A Capacitor app: same build, same ID, but no script, no queue and no request.
  await page.unroute(/^https:\/\/www\.googletagmanager\.com\//);
  let nativeRequests = 0;
  await page.route(/^https:\/\/www\.googletagmanager\.com\//, route => { nativeRequests++; return route.abort('blockedbyclient'); });
  await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
  await page.goto(page.smokeOrigin + '/home');
  await home();
  await settle();
  await go('/courses');
  await page.waitForURL('**/courses');
  await settle();
  const native = await page.evaluate(() => ({
    isNative: window.Capacitor?.isNativePlatform(),
    started: 'gtag' in window || 'dataLayer' in window,
    script: Boolean(document.querySelector('script[src*="googletagmanager"]')) }));
  if (!native.isNative) throw Error('The fixture did not look like a Capacitor app');
  if (native.started || native.script || nativeRequests) throw Error('A Capacitor app started analytics: ' + JSON.stringify([native, nativeRequests]));
  return { errors: page.smokeErrors, pageViews: views };
}
