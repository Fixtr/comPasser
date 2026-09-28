import { chromium } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { enforcePlannerConstraints } from '../src/domains/planner/services/planner-constraints.mjs';
import { prepareGeneratedPlaces } from '../src/domains/map/services/recommendation-place.mjs';

// Serve this checkout in isolation. A local browser origin preserves the Maps
// key's approved referrer without loading another checkout's running app.
const { values } = parseArgs({ options: { captures: { type: 'string' }, out: { type: 'string' },
  origin: { type: 'string', default: 'http://localhost:5173' } } });
if (!values.captures || !values.out || !['localhost', '127.0.0.1'].includes(new URL(values.origin).hostname)) {
  throw new Error('Usage: node scripts/capture-itinerary-maps.mjs --captures DIR --out NEW_DIR [--origin http://localhost:5173]');
}
if (!process.env.VITE_MAPS_API_KEY) throw new Error('VITE_MAPS_API_KEY is required');
const out = resolve(values.out);
await mkdir(out, { recursive: true });
if ((await readdir(out)).length) throw new Error('Output directory must be empty');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: false, envDir: false,
  define: { 'import.meta.env.VITE_MAPS_API_KEY': JSON.stringify(process.env.VITE_MAPS_API_KEY) },
  server: { host: '127.0.0.1', port: 0, hmr: false } });
await server.listen();
const localOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block' });
  const entry = `${values.origin}/__itinerary-evaluation`;
  await page.route(`${values.origin}/**`, async route => {
    if (route.request().url() === entry) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Itinerary evaluation</title>' });
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${localOrigin}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await page.goto(entry);
  await page.evaluate(async () => {
    const { getMapsLoader } = await import('/src/domains/map/services/google-maps-loader.js');
    const { GeocodingService } = await import('/src/domains/map/services/geocoding-service.js');
    const { RoutingService } = await import('/src/domains/map/services/routing-service.js');
    const { buildTransitDepartureTime } = await import('/src/domains/map/services/transit-time.mjs');
    const { createItineraryState } = await import('/src/domains/itinerary/services/itinerary-state.mjs');
    const { fitMeasuredSchedule } = await import('/src/domains/itinerary/services/itinerary-end-fit.mjs');
    const { applyTransitDelays } = await import('/src/domains/itinerary/services/itinerary-schedule-adjust.mjs');
    const loader = getMapsLoader();
    const geo = new GeocodingService(loader), routing = new RoutingService(loader);
    const diagnostics = [];
    const warn = console.warn.bind(console);
    console.warn = (...args) => {
      if (args[0] === '[Recommendation] unresolved') diagnostics.push(structuredClone(args[1]));
      warn(...args);
    };
    if (!await geo.resolvePlace('서울역')) throw new Error('Maps preflight failed: cannot resolve Seoul Station');
    const coordinate = value => ({ lat: typeof value.lat === 'function' ? value.lat() : value.lat,
      lng: typeof value.lng === 'function' ? value.lng() : value.lng });
    window.captureDay = async (day, constraint) => {
      const state = createItineraryState();
      state.open({ days: [day] });
      const rounds = [];
      for (let round = 0; round < 3; round++) {
        const diagnosticStart = diagnostics.length;
        const items = state.current.plan.days[0].scheduleItems.map((item, index) => ({ ...item, displayIndex: index + 1 }));
        const places = await geo.geocodeSchedule(items, day.date);
        state.resolvePlaces(0, items.map((item, index) => {
          const found = places.find(p => p.displayIndex === index + 1);
          return { index, name: found?.resolvedName || '', address: found?.resolvedAddress || '',
            ...(!['departure', 'arrival', 'AnchorSchedule'].includes(item.type) && Object.hasOwn(item, 'placeIntent')
              ? { verifiedPlace: found?.verifiedPlace || null } : {}) };
        }));
        const transitRoutes = (await Promise.all(places.slice(0, -1).map(async (place, i) => {
          const next = places[i + 1], fromIndex = place.displayIndex - 1, toIndex = next.displayIndex - 1;
          if (toIndex !== fromIndex + 1) return null;
          const origin = coordinate(place.latLng), destination = coordinate(next.latLng);
          const departureTime = buildTransitDepartureTime(day.date, place.endTime || place.time);
          const route = { fromIndex, toIndex, departureTime: departureTime?.toISOString(), origin, destination };
          if (origin.lat.toFixed(5) === destination.lat.toFixed(5) && origin.lng.toFixed(5) === destination.lng.toFixed(5)) {
            return { ...route, durationMinutes: 0, mode: 'SAME_PLACE' };
          }
          let timer;
          try {
            const result = await Promise.race([routing.getTransitRoute(origin, destination, departureTime),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 30000); })]);
            const leg = result.routes?.[0]?.legs?.[0];
            return { ...route, durationMinutes: Number.isFinite(leg?.duration?.value) ? Math.round(leg.duration.value / 60) : null,
              durationSeconds: leg?.duration?.value ?? null,
              distanceMeters: leg?.distance?.value ?? null, mode: 'TRANSIT' };
          } catch { return { ...route, durationMinutes: null, error: 'route-unavailable' }; }
          finally { clearTimeout(timer); }
        }))).filter(Boolean);
        const resolved = state.current.plan.days[0].scheduleItems;
        const fit = round < 2 ? fitMeasuredSchedule(resolved, transitRoutes, constraint.endTime, constraint.startTime)
          : { items: applyTransitDelays(resolved, transitRoutes, constraint.startTime), adjusted: false };
        rounds.push({ round, scheduleItems: structuredClone(resolved), transitRoutes, adjusted: fit.adjusted,
          diagnostics: diagnostics.slice(diagnosticStart) });
        state.replaceDayItems(0, fit.items);
        if (!fit.adjusted) break;
      }
      return { ...day, scheduleItems: state.current.plan.days[0].scheduleItems,
        transitRoutes: rounds.at(-1).transitRoutes, rounds };
    };
  });
  for (const file of (await readdir(values.captures)).filter(f => f.endsWith('.capture.json')).sort()) {
    const record = JSON.parse(await readFile(join(values.captures, file), 'utf8'));
    if (record.error) continue;
    const days = enforcePlannerConstraints(prepareGeneratedPlaces(record.response.days), record.request, 'ko');
    const hash = data => createHash('sha256').update(data).digest('hex');
    const sourceHashes = {};
    for (const path of ['map/services/geocoding-service.js', 'map/services/routing-service.js',
      'map/services/recommendation-place.mjs', 'itinerary/services/itinerary-state.mjs',
      'itinerary/services/itinerary-end-fit.mjs', 'itinerary/services/itinerary-schedule-adjust.mjs']) {
      sourceHashes[path] = hash(await readFile(join(root, 'src/domains', path)));
    }
    const snapshot = { source: 'google_maps', capturedAt: new Date().toISOString(), timezone: 'Asia/Seoul',
      collectorHash: hash(await readFile(new URL(import.meta.url))), sourceHashes, days: [] };
    for (const day of days) {
      const measured = await page.evaluate(({ day, constraint }) => window.captureDay(day, constraint),
        { day, constraint: record.request.dailyData.find(c => c.day === day.day) });
      snapshot.days.push(measured);
      console.log(`${record.case} day ${day.day}: ${measured.transitRoutes.filter(r => r.durationMinutes !== null).length}/${measured.scheduleItems.length - 1} routes`);
    }
    await writeFile(join(out, file), JSON.stringify({ ...record, mapsSnapshot: snapshot }, null, 2) + '\n');
  }
} finally { await browser?.close(); await server.close(); }
