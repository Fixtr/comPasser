import test from 'node:test';
import assert from 'node:assert/strict';
import { courseCities, curatedRoute, checkedVisitorInfo, preparePublicRouteExtras, publicRouteUrl } from '../src/domains/itinerary/services/public-route.mjs';
import { renderPublicRoute, renderRouteDirectory } from '../src/domains/itinerary/services/public-route-html.mjs';
import { addCourseToDraft } from '../src/domains/planner/services/course-draft.mjs';
import worker from '../src/server/public-routes-worker.mjs';

const origin = 'https://example.com';
const env = { PUBLIC_APP_URL: origin, FIREBASE_PROJECT_ID: 'example-project' };
const request = path => new Request(`${origin}${path}`);
const info = { englishMenu: 'available', reservation: 'recommended', sourceUrl: 'https://example.com/menu', checkedOn: '2026-10-04' };
test('every city offers three distinct importable courses and valid English pages', async () => {
  for (const city of courseCities) {
    const combinations = new Set();
    for (const suffix of ['', '-2', '-3']) {
      const id = `curated-${city.id}${suffix}`;
      const route = curatedRoute(id);
      assert.equal(route.stops.length, 2);
      assert.ok(route.stops.every(stop => stop.name && stop.location && stop.stayMinutes > 0));
      combinations.add(route.stops.map(stop => stop.name).join('|'));
      assert.equal(addCourseToDraft({anchorSchedules: []}, route).anchorSchedules.length, 2);
      assert.equal((await worker.fetch(request(`/en/routes/${id}`), env)).status, 200);
      assert.equal(publicRouteUrl(id, origin), `${origin}/en/routes/${id}`);
    }
    assert.equal(combinations.size, 3);
    assert.equal(curatedRoute(`curated-${city.id}-4`), null);
  }
});
const encode = value => Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
  : value && typeof value === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } }
    : typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value };

test('publisher visitor claims require a source and a real, nonfuture date', () => {
  assert.deepEqual(checkedVisitorInfo(info, '2026-10-05'), info);
  assert.equal(checkedVisitorInfo({ englishMenu: 'unknown', reservation: 'unknown', sourceUrl: '' }), null);
  for (const patch of [{ sourceUrl: '' }, { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:secret@example.com' },
    { checkedOn: '2026-02-30' }, { checkedOn: '2026-10-06' }, { reservation: 'guaranteed' }]) {
    assert.throws(() => checkedVisitorInfo({ ...info, ...patch }, '2026-10-05'), /visitorInfoInvalid/);
  }
  assert.deepEqual(preparePublicRouteExtras({ titleEn: ' A day ', creditName: ' Traveler ', creditUrl: 'https://example.com/post' }),
    { titleEn: 'A day', credit: { name: 'Traveler', url: 'https://example.com/post' } });
  assert.throws(() => preparePublicRouteExtras({ creditUrl: 'https://example.com' }));
  assert.throws(() => publicRouteUrl('../private', origin));
});

test('import adds flexible required visits and preserves the chosen endpoints and existing appointments', () => {
  const route = curatedRoute('curated-seoul');
  const draft = { anchorSchedules: [{ day: 1, name: 'Ticket', location: 'Venue', time: '18:00' }], startLocation: 'My hostel', endLocation: 'Station', selectedWaypoints: [] };
  const imported = addCourseToDraft(draft, route, 'en');
  assert.equal(imported.startLocation, 'My hostel'); assert.equal(imported.endLocation, 'Station');
  assert.deepEqual(imported.anchorSchedules[0], draft.anchorSchedules[0]);
  assert.deepEqual(imported.anchorSchedules.slice(1).map(stop => stop.name), route.stops.map(stop => stop.englishName));
  assert.ok(imported.anchorSchedules.slice(1).every(stop => stop.flexible && !stop.time));
  assert.equal(addCourseToDraft(imported, route, 'en').anchorSchedules.length, imported.anchorSchedules.length);
  assert.equal(draft.anchorSchedules.length, 1);
});

test('English landing HTML escapes publisher content and distinguishes unchecked information', () => {
  const route = { ...curatedRoute('curated-seoul'), id: 'route1', curated: false,
    titleEn: '<script>alert(1)</script>', credit: { name: '<img onerror=alert(1)>', url: 'javascript:alert(1)' } };
  route.stops[0].visitorInfo = info;
  const html = renderPublicRoute(route, origin);
  assert.match(html, /<html lang="en">/); assert.match(html, /rel="canonical" href="https:\/\/example.com\/en\/routes\/route1"/);
  assert.match(html, /&lt;script&gt;alert/); assert.doesNotMatch(html, /<img onerror|href="javascript:/);
  assert.match(html, /Checked by the route publisher on 2026-10-04/);
  assert.match(html, /Menu and reservation information has not been checked/);
  assert.match(html, /\/home\?course=route1&amp;lang=en/);
  assert.match(html, /Building the itinerary needs an account/);
  assert.match(html, /Copy local address/);
  assert.doesNotMatch(renderPublicRoute(curatedRoute('curated-seoul'), origin), /Traveler reviews/);
});

test('curated English pages, QR downloads, HEAD and invalid routes work without private data', async () => {
  const overseas = await worker.fetch(request('/en/routes/curated-newyork'), env);
  assert.equal(overseas.status, 200);
  const overseasHtml = await overseas.text();
  assert.match(overseasHtml, /The Metropolitan Museum of Art/);
  assert.doesNotMatch(overseasHtml, /plan your visit in Korea/);
  const response = await worker.fetch(request('/en/routes/curated-busan'), env);
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(await response.text(), /Busan: Haeundae Beach and Dongbaekseom Island/);
  const qr = await worker.fetch(request('/en/routes/curated-busan/qr.svg?download=1'), env);
  assert.equal(qr.headers.get('Content-Type'), 'image/svg+xml'); assert.match(qr.headers.get('Content-Disposition'), /attachment/);
  assert.match(await qr.text(), /^<svg /);
  const head = await worker.fetch(new Request(`${origin}/en/routes/curated-busan`, { method: 'HEAD' }), env);
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal((await worker.fetch(request('/en/routes/curated-missing'), env)).status, 404);
  assert.equal((await worker.fetch(request('/en/routes/route1/extra/path'), env)).status, 404);
  const asset = await worker.fetch(request('/favicon.svg'), { ...env, ASSETS: { fetch: () => new Response('asset') } });
  assert.equal(await asset.text(), 'asset');
});

test('public pages read only the guest-readable collection and stop serving revoked content', async t => {
  const course = { title: 'Public museum', stops: [{ name: 'Museum', location: 'Seoul', stayMinutes: 90 }, { name: 'Cafe', location: 'Seoul cafe', stayMinutes: 60 }] };
  let status = 200;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url.pathname, /\/documents\/public_courses\/route1$/);
    assert.deepEqual(url.searchParams.getAll('mask.fieldPaths'), ['title', 'titleEn', 'review', 'stops', 'credit']);
    assert.equal(options.headers.Authorization, undefined);
    return new Response(status === 200 ? JSON.stringify({ name: 'projects/example-project/databases/(default)/documents/public_courses/route1', fields: encode(course).mapValue.fields }) : '{}', { status });
  });
  const first = await worker.fetch(request('/en/routes/route1'), env);
  assert.equal(first.status, 200); assert.match(await first.text(), /Public museum/);
  status = 404;
  const removed = await worker.fetch(request('/en/routes/route1'), env);
  assert.equal(removed.status, 404); assert.doesNotMatch(await removed.text(), /Public museum/);
  assert.equal((await worker.fetch(request('/en/routes/route1/qr.svg'), env)).status, 404);
  status = 403;
  const offline = await worker.fetch(request('/en/routes/route1'), env);
  assert.equal(offline.status, 503); assert.match(await offline.text(), /noindex/);
});

test('directory links every route on the same site and the sitemap uses canonical route URLs', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ documents: [] })));
  const directory = await worker.fetch(request('/en/routes'), env);
  const html = await directory.text();
  // Each route page carries its absolute canonical URL; the directory's own links stay on the site serving it.
  for (const city of courseCities) for (const suffix of ['', '-2', '-3']) assert.ok(html.includes(`href="/en/routes/curated-${city.id}${suffix}"`));
  const sitemap = await worker.fetch(request('/sitemap.xml'), env);
  assert.equal(sitemap.headers.get('Content-Type'), 'application/xml');
  assert.equal((await sitemap.text()).match(/<loc>/g).length, courseCities.length * 3 + 1);
  assert.match(await (await worker.fetch(request('/robots.txt'), env)).text(), /Sitemap: https:\/\/example.com\/sitemap.xml/);
});

test('curated stops abroad show the local name, one place line and a maps link, never the Korean name', () => {
  const tokyo = renderPublicRoute(curatedRoute('curated-tokyo'), origin);
  assert.match(tokyo, /<p lang="ja">浅草寺<\/p>/);
  assert.doesNotMatch(tokyo, /센소지|도쿄 타워/);
  assert.equal(tokyo.match(/浅草寺, Tokyo<\/p>/g).length, 1, 'the place line is not repeated as an "English address"');
  assert.match(tokyo, /<p class="address" lang="ja">浅草寺, Tokyo<\/p>/);
  assert.match(tokyo, /Copy place name/); assert.doesNotMatch(tokyo, /Copy local address/);
  assert.match(tokyo, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=%E6%B5%85%E8%8D%89%E5%AF%BA%2C%20Tokyo/);
  assert.doesNotMatch(tokyo, /Not checked/);
  // No local name in the catalogue (numbered ids) means no second name line at all.
  const bangkok = renderPublicRoute(curatedRoute('curated-bangkok'), origin);
  assert.doesNotMatch(bangkok, /방콕 왕궁|왓 포/);
  assert.doesNotMatch(bangkok, / lang="th"/);
  // A local name equal to the English one is not shown twice.
  assert.doesNotMatch(renderPublicRoute(curatedRoute('curated-paris-3'), origin), /<p lang="fr">Arc de Triomphe<\/p>/);
  // Korean routes keep the Korean name and real local address, tagged as Korean.
  const seoul = renderPublicRoute(curatedRoute('curated-seoul'), origin);
  assert.match(seoul, /<p lang="ko">경복궁<\/p>/); assert.match(seoul, /class="address" lang="ko"/); assert.match(seoul, /Copy local address/);
  assert.doesNotMatch(seoul, /Not checked/);
});

test('the route directory groups routes by city with jump links, distinct titles and a travelers section', () => {
  const curated = courseCities.flatMap(city => ['', '-2', '-3'].map(suffix => curatedRoute(`curated-${city.id}${suffix}`)));
  const travelers = [{ id: 'trip1', title: '3', stops: [{ name: '경복궁', location: '경복궁, 서울', stayMinutes: 60 }, { name: '북촌', location: '북촌, 서울', stayMinutes: 60 }] }];
  const html = renderRouteDirectory([...curated, ...travelers], origin);
  assert.doesNotMatch(html, /Korea/);
  assert.match(html, /<a href="#city-tokyo">Tokyo<\/a>/);
  assert.match(html, /<h3><a href="\/en\/routes\/curated-tokyo">/); assert.doesNotMatch(html, /<h3><a href="https:/); assert.match(html, /<section id="city-tokyo"><h2>Tokyo<\/h2>/);
  assert.match(html, /<section id="travelers"><h2>Shared by travelers<\/h2>/);
  const titles = [...html.matchAll(/<h3><a [^>]+>([^<]+)<\/a><\/h3>/g)].map(match => match[1]);
  assert.equal(titles.length, curated.length + 1);
  assert.equal(new Set(titles).size, titles.length, 'every card has its own title');
  assert.ok(titles.includes('경복궁 → 북촌'), 'a title with no letters is replaced by the stops');
  // A digits-only English title does not hide the traveler's own title.
  assert.match(renderPublicRoute({ ...travelers[0], title: '서울 산책', titleEn: '2024' }, origin), /<h1>서울 산책<\/h1>/);
  assert.ok(html.indexOf('id="city-seoul"') < html.indexOf('id="city-tokyo"') && html.indexOf('id="city-tokyo"') < html.indexOf('id="travelers"'));
});

test('route pages link every stop to maps and directions, jump to planning from the top, and follow dark mode', () => {
  const seoul = renderPublicRoute(curatedRoute('curated-seoul'), origin);
  const stops = curatedRoute('curated-seoul').stops;
  assert.equal(seoul.match(/>Open in Google Maps</g).length, 2);
  assert.match(seoul, new RegExp(`https://map\\.naver\\.com/p/search/${encodeURIComponent(stops[0].location).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.equal(seoul.match(/>Directions from /g).length, 1, 'only stops after the first get directions');
  assert.match(seoul, /maps\/dir\/\?api=1&amp;origin=[^"]+&amp;destination=[^"]+&amp;travelmode=transit/);
  const tokyo = renderPublicRoute(curatedRoute('curated-tokyo'), origin);
  assert.doesNotMatch(tokyo, /Naver Map/);
  assert.match(tokyo, />Directions from Sensoji Temple</);
  // Planning is reachable without scrolling two screens: a top link to the planning section.
  assert.ok(seoul.indexOf('href="#plan"') < seoul.indexOf('<article>'));
  assert.match(seoul, /<section class="start" id="plan">/);
  assert.match(seoul, /prefers-color-scheme:dark/); assert.match(seoul, /:root\[data-theme=dark\]/);
  // Print forces the light palette over both dark rules; the stored theme applies before first paint.
  assert.match(seoul, /@media print\{:root,:root\[data-theme\]\{color-scheme:light;/);
  assert.ok(seoul.indexOf('<script src="/route-theme.js') < seoul.indexOf('<style>'));
  assert.match(seoul, /outline:3px solid var\(--focus\)/);
  assert.match(seoul, /id="download-qr"[^>]+data-qr="\/en\/routes\/curated-seoul\/qr\.svg"/);
  assert.match(seoul, /class="action" href="\/en\/routes\/curated-seoul\/qr\.svg\?download=1">Download QR \(SVG\)/);
  // Traveler names are escaped inside the directions link text.
  const traveler = renderPublicRoute({ id: 'trip1', title: 'Walk', stops: [{ name: '<b>A</b>', location: 'A', stayMinutes: 30 }, { name: 'B', location: 'B', stayMinutes: 30 }] }, origin);
  assert.match(traveler, /Directions from &lt;b&gt;A&lt;\/b&gt;/);
});

test('/en alone goes to the directory and other /en pages get an English not-found page', async () => {
  const qr = await (await worker.fetch(request('/en/routes/curated-seoul/qr.svg'), env)).text();
  assert.match(qr, /^<svg [^>]*width="\d+px" height="\d+px"/, 'an intrinsic size lets browsers draw it onto the PNG canvas');
  const bare = await worker.fetch(request('/en'), env);
  assert.equal(bare.headers.get('Strict-Transport-Security'), 'max-age=31536000');
  assert.equal(bare.status, 301); assert.equal(bare.headers.get('Location'), '/en/routes');
  assert.equal((await worker.fetch(request('/en/'), env)).headers.get('Location'), '/en/routes');
  const typo = await worker.fetch(request('/en/rout'), env);
  assert.equal(typo.status, 404);
  const html = await typo.text();
  assert.match(html, /<html lang="en">/); assert.match(html, /We could not find this page/); assert.match(html, /noindex/);
  assert.match(await (await worker.fetch(request('/en/routes/curated-missing'), env)).text(), /may no longer be public, or the address may be mistyped/);
});
