import qrcode from 'qrcode-generator';
import { cities } from '../domains/planner/services/discovery-catalogue.mjs';
import { curatedRoute, PUBLIC_ROUTE_ID, publicRouteUrl } from '../domains/itinerary/services/public-route.mjs';
import { renderPublicRoute, renderRouteDirectory, renderRouteError } from '../domains/itinerary/services/public-route-html.mjs';
import { DEFAULT_PUBLIC_APP_URL } from '../domains/itinerary/services/share-url.mjs';
import { escapeHtml } from '../utils/html-safety.mjs';

export function decodeFirestore(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestore);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decodeFirestore(item)]));
  return null;
}

const fields = ['title', 'titleEn', 'review', 'stops', 'credit'];
async function publicDocuments(project, id, pageSize = 18) {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(project || '')) throw new Error('Missing public project');
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/public_courses${id ? `/${id}` : ''}`);
  for (const field of fields) url.searchParams.append('mask.fieldPaths', field);
  if (!id) url.searchParams.set('pageSize', String(pageSize));
  // Guest rules apply. No Admin credentials or private collection reads.
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  if (id && response.status === 404) return null;
  if (!response.ok) throw new Error('Public route fetch failed');
  const data = await response.json();
  const convert = document => ({ id: document.name.split('/').at(-1), ...decodeFirestore({ mapValue: { fields: document.fields } }) });
  return id ? convert(data) : (data.documents || []).map(convert);
}

const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = new URL(env.PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL).origin;
    const project = env.FIREBASE_PROJECT_ID || (typeof __FIREBASE_PROJECT__ !== 'undefined' ? __FIREBASE_PROJECT__ : '');
    const curated = cities.map(city => curatedRoute(`curated-${city.id}`));
    const response = (body, status = 200, type = 'text/html; charset=utf-8', extras = {}) => new Response(request.method === 'HEAD' ? null : body,
      { status, headers: { ...securityHeaders, 'Content-Type': type, ...extras } });
    if (!['GET', 'HEAD'].includes(request.method)) return response('Method not allowed', 405, 'text/plain', { Allow: 'GET, HEAD' });
    if (url.pathname === '/robots.txt') return response(`User-agent: *\nAllow: /en/routes\nDisallow: /view\nDisallow: /share\nDisallow: /profile\nSitemap: ${origin}/sitemap.xml\n`, 200, 'text/plain');
    if (url.pathname === '/sitemap.xml') {
      try {
        // ponytail: first 200 public routes; split sitemaps when the catalogue outgrows this bound.
        const publicCourses = await publicDocuments(project, null, 200);
        const links = [`${origin}/en/routes`, ...[...curated, ...publicCourses].map(course => publicRouteUrl(course.id, origin))];
        return response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${links.map(link => `<url><loc>${escapeHtml(link)}</loc></url>`).join('')}</urlset>`, 200, 'application/xml');
      } catch { return response('Sitemap temporarily unavailable', 503, 'text/plain', { 'Retry-After': '30' }); }
    }
    if (/^\/en\/routes\/?$/.test(url.pathname)) {
      let publicCourses = [];
      try { publicCourses = await publicDocuments(project); } catch { /* Curated routes remain available without Firestore. */ }
      return response(renderRouteDirectory([...curated, ...publicCourses], origin));
    }
    const match = url.pathname.match(/^\/en\/routes\/([^/]+)(\/qr\.svg)?\/?$/);
    if (!match) return url.pathname.startsWith('/en/routes/')
      ? response(renderRouteError(404, origin), 404) : env.ASSETS.fetch(request);
    const [, id, qr] = match;
    if (!PUBLIC_ROUTE_ID.test(id)) return response(renderRouteError(404, origin), 404);
    try {
      const course = curatedRoute(id) || await publicDocuments(project, id);
      if (!course) return response(renderRouteError(404, origin), 404);
      if (qr) {
        const code = qrcode(0, 'M'); code.addData(publicRouteUrl(id, origin)); code.make();
        return response(code.createSvgTag({ cellSize: 4, margin: 16, scalable: true }), 200, 'image/svg+xml',
          url.searchParams.has('download') ? { 'Content-Disposition': `attachment; filename="compasser-${id}.svg"` } : {});
      }
      return response(renderPublicRoute(course, origin));
    } catch {
      console.error(JSON.stringify({ event: 'public_route_unavailable' }));
      return response(renderRouteError(503, origin), 503, 'text/html; charset=utf-8', { 'Retry-After': '30' });
    }
  },
};
