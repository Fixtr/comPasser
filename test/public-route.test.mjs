import test from 'node:test';
import assert from 'node:assert/strict';
import { courseCities, curatedRoute, checkedVisitorInfo, preparePublicRouteExtras, publicRouteUrl } from '../src/domains/itinerary/services/public-route.mjs';
import { renderPublicRoute } from '../src/domains/itinerary/services/public-route-html.mjs';
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
  assert.match(await response.text(), /Busan: a first visit/);
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

test('directory and sitemap use canonical individual route URLs', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ documents: [] })));
  const directory = await worker.fetch(request('/en/routes'), env);
  const html = await directory.text();
  for (const city of courseCities) for (const suffix of ['', '-2', '-3']) assert.ok(html.includes(`https://example.com/en/routes/curated-${city.id}${suffix}`));
  const sitemap = await worker.fetch(request('/sitemap.xml'), env);
  assert.equal(sitemap.headers.get('Content-Type'), 'application/xml');
  assert.equal((await sitemap.text()).match(/<loc>/g).length, courseCities.length * 3 + 1);
  assert.match(await (await worker.fetch(request('/robots.txt'), env)).text(), /Sitemap: https:\/\/example.com\/sitemap.xml/);
});
