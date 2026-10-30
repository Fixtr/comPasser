import { escapeHtml as e, safeHttpUrl } from '../../../utils/html-safety.mjs';
import { courseCities, publicRouteUrl } from './public-route.mjs';
import { courseCity } from './course-community.mjs';
import { tFor } from '../../../utils/i18n.js';

// Local names and addresses carry their language so screen readers do not read Hangul or kana as English.
const LOCAL_LANG = { KOR: 'ko', JPN: 'ja', FRA: 'fr', TWN: 'zh-Hant', THA: 'th', VNM: 'vi', ITA: 'it', ESP: 'es', SGP: 'en', GBR: 'en', USA: 'en' };
const routeCity = course => courseCities.find(city => city.id === (course.destination?.id || courseCity(course)));
// Some traveler routes are titled just '3'; a title with no letters says nothing, so the stops stand in.
const routeTitle = course => [course.titleEn, course.title].find(title => /\p{L}/u.test(title || ''))
  || course.stops.map(stop => stop.englishName || stop.name).join(' → ');

const styles = `
  :root{color-scheme:light;--ink:#17201c;--paper:#f4f4f1;--card:#fff;--rule:#c8ccc5;--muted:#515b54;--focus:#145ca3}*{box-sizing:border-box}
  /* Follow the system, or the theme stored by the app (route-page.js sets data-theme), like the app does. */
  @media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--ink:#EDEDE9;--paper:#121211;--card:#1c1c1a;--rule:#3a3a37;--muted:#C2C2BD;--focus:#6aa6ec}}
  :root[data-theme=dark]{color-scheme:dark;--ink:#EDEDE9;--paper:#121211;--card:#1c1c1a;--rule:#3a3a37;--muted:#C2C2BD;--focus:#6aa6ec}
  body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.65 system-ui,sans-serif}
  main,header,footer{max-width:850px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:20px}
  h1{font-size:clamp(2rem,6vw,3.2rem);line-height:1.12}h2{font-size:1.35rem}a{color:inherit}
  article,.share{border:1px solid var(--rule);background:var(--card);padding:24px;margin:20px 0;overflow-wrap:anywhere}
  button,.action{display:inline-block;padding:12px 18px;min-height:44px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);font:inherit;text-decoration:none;cursor:pointer}
  button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
  .actions{display:flex;flex-wrap:wrap;gap:12px}.links{display:flex;flex-wrap:wrap;gap:8px 16px;margin:12px 0}.muted{color:var(--muted)}.address{user-select:all}img{max-width:100%;height:auto}
  label{display:block}input{display:block;min-height:44px;width:100%;padding:10px;font:inherit;margin:8px 0 16px}
  .qr{width:190px;background:#fff}.share code{display:block;overflow-wrap:anywhere}footer{font-size:.9rem}
  .cities{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.cities a{display:inline-block;padding:8px 12px;min-height:44px;border:1px solid var(--rule);background:var(--card);text-decoration:none}
  .card{position:relative}.card h3 a::after{content:"";position:absolute;inset:0}
  header a,.links a,article>a{display:inline-flex;align-items:center;min-height:44px}
  @media print{:root,:root[data-theme]{color-scheme:light;--ink:#17201c;--card:#fff;--rule:#c8ccc5;--muted:#515b54}header,.actions,.links,.start,footer,button{display:none}body{background:white}main{padding:0}article{break-inside:avoid}.share{border:0}}
`;

// shortcut: bump ?v= when route-page.js or route-theme.js changes with the HTML; an old service worker
// serves these from its cache by full URL, so a stale script would miss new buttons until it updates.
const ROUTE_SCRIPTS = { theme: '/route-theme.js?v=1', page: '/route-page.js?v=2' };

function shell(title, description, canonical, body, { noindex = false, script = `<script src="${ROUTE_SCRIPTS.page}" defer></script>` } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${e(title)} | ComPasser</title><meta name="description" content="${e(description)}">
    <link rel="canonical" href="${e(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)}">
    <meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(canonical)}">
    ${noindex ? '<meta name="robots" content="noindex">' : ''}<link rel="icon" href="/favicon.svg">
    <script src="${ROUTE_SCRIPTS.theme}"></script><style>${styles}</style></head>
    <body><header><a href="/en/routes">ComPasser · Travel routes</a><a href="/home?lang=en">Build your trip</a></header>
    <main>${body}</main><footer>Choose your own dates, accommodation and fixed appointments when you build a trip.</footer>${script}</body></html>`;
}

export function renderPublicRoute(course, origin) {
  const canonical = publicRouteUrl(course.id, origin);
  const title = routeTitle(course);
  const names = course.stops.map(stop => stop.englishName || stop.name);
  const country = routeCity(course)?.country || course.destination?.country;
  // Only curated names are known to be in the city's language; travelers often type theirs in Korean.
  const lang = course.curated && LOCAL_LANG[country] ? ` lang="${LOCAL_LANG[country]}"` : '';
  // Curated stops abroad store a Korean `name` for the app and only a 'place, city' search text, not a street address.
  const abroad = course.curated && country !== 'KOR';
  const description = `${names.join(' → ')}. Choose your dates and starting place to plan your visit.`;
  const stopHtml = course.stops.map((stop, index) => {
    const info = stop.visitorInfo;
    const menu = { available: 'Available', unavailable: 'Not available', unknown: 'Not checked' };
    const reservation = { required: 'Required', recommended: 'Recommended', not_required: 'Not required', unknown: 'Not checked' };
    const source = info && safeHttpUrl(info.sourceUrl);
    const english = stop.englishName || stop.name;
    const local = abroad ? stop.localName : stop.name;
    const where = abroad
      // With a local name the place line is that name plus the city; numbered stops' lines are English.
      ? `<p class="address"${stop.localName ? lang : ''}>${e(stop.location)}</p>
      <button type="button" class="copy-address" data-address="${e(stop.location)}" aria-label="Copy place name for ${e(english)}">Copy place name</button>`
      : `${stop.englishAddress ? `<p>${e(stop.englishAddress)}</p>` : ''}<p class="address"${lang}>${e(stop.location)}</p>
      <button type="button" class="copy-address" data-address="${e(stop.location)}" aria-label="Copy local address for ${e(english)}">Copy local address</button>`;
    const previous = course.stops[index - 1];
    // Each stop repeats the same link words; the name adds the stop so a list of links tells them apart.
    const external = (href, text, label) => `<a href="${e(href)}" target="_blank" rel="noopener noreferrer"${label ? ` aria-label="${label}"` : ''}>${text}</a>`;
    // Google Maps directions are weak in Korea, so Korean stops also get Naver Map.
    const maps = `<p class="links">${external(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.location)}`, 'Open in Google Maps', `Open in Google Maps: ${e(english)}`)}
      ${country === 'KOR' ? external(`https://map.naver.com/p/search/${encodeURIComponent(stop.location)}`, 'Open in Naver Map', `Open in Naver Map: ${e(english)}`) : ''}
      ${previous ? external(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(previous.location)}&destination=${encodeURIComponent(stop.location)}&travelmode=transit`, `Directions from ${e(previous.englishName || previous.name)}`) : ''}</p>`;
    // Curated stops carry no checked menu or reservation data, so 'Not checked' twice per beach is only noise.
    const checked = source ? `<p>English menu: ${e(menu[info.englishMenu] || 'Not checked')}<br>
      Reservation: ${e(reservation[info.reservation] || 'Not checked')}</p>
      <p class="muted">Checked by the route publisher on ${e(info.checkedOn)}. <a href="${e(source)}" target="_blank" rel="noopener noreferrer">Read the source</a>. Confirm details before visiting.</p>`
      : course.curated ? '' : `<p>English menu: Not checked<br>Reservation: Not checked</p>
      <p class="muted">Menu and reservation information has not been checked.</p>`;
    return `<article><h2>${index + 1}. ${e(english)}</h2>
      ${local && local !== english ? `<p${lang}>${e(local)}</p>` : ''}
      <p>${e(stop.stayMinutes)} minutes suggested visit time · excludes travel</p>
      ${where}
      ${maps}
      ${checked}
      ${safeHttpUrl(stop.guideUrl) ? `<a href="${e(safeHttpUrl(stop.guideUrl))}" target="_blank" rel="noopener noreferrer" aria-label="Official visitor guide for ${e(english)}">Official visitor guide</a>` : ''}</article>`;
  }).join('');
  const credit = course.credit;
  const creditHtml = credit?.name ? `<p>Shared by ${safeHttpUrl(credit.url) ? `<a href="${e(safeHttpUrl(credit.url))}" target="_blank" rel="noopener noreferrer">${e(credit.name)}</a>` : e(credit.name)}</p>` : '';
  return shell(title, description, canonical, `<p>${course.curated ? 'Curated route' : 'Traveler route · names and notes may be in their original language'}</p>
    <h1>${e(title)}</h1>${creditHtml}<p>${e(course.review || '')}</p>
    <div class="actions"><a class="action" href="#plan">Start planning</a></div>${stopHtml}
    <section class="start" id="plan"><label for="start-location">Start near your accommodation (optional)</label>
    <input id="start-location" maxlength="200" placeholder="Enter a hotel, station or address"></section>
    <div class="actions"><a class="action" id="plan-route" href="/home?course=${e(course.id)}&amp;lang=en" data-city="${e(course.destination?.id || courseCity(course) || '')}">Plan with these places</a>
      ${course.curated ? '' : `<a href="/courses?review=${e(course.id)}&amp;lang=en">Traveler reviews</a>`}</div>
    <p class="muted">Building the itinerary needs an account. Places become required visits. Check travel times and opening hours in your generated itinerary.</p>
    <section class="share"><h2>Share this route</h2><p>Use this link in a video, travel post or accommodation guide.</p>
      <code>${e(canonical)}</code><img class="qr" src="/en/routes/${e(course.id)}/qr.svg" alt="QR code for this route" width="190" height="190">
      <div class="actions"><button id="copy-link" type="button">Copy link</button><button id="download-qr" type="button" data-qr="/en/routes/${e(course.id)}/qr.svg" data-name="compasser-${e(course.id)}">Download QR (PNG)</button><a class="action" href="/en/routes/${e(course.id)}/qr.svg?download=1">Download QR (SVG)</a><button id="print-route" type="button">Print route and QR</button></div>
      <p id="route-status" role="status" aria-live="polite"></p></section>`);
}

export function renderRouteDirectory(courses, origin) {
  // Same-site links: an absolute href sends preview and local servers to the production site.
  const card = course => `<article class="card"><h3><a href="${e(new URL(publicRouteUrl(course.id, origin)).pathname)}">${e(routeTitle(course))}</a></h3><p>${e(course.stops.map(stop => stop.englishName || stop.name).join(' → '))}</p></article>`;
  // One section per city, in the catalogue's order, so a visitor looking for Tokyo can jump straight there.
  const groups = courseCities.map(city => ({ city, routes: courses.filter(course => course.curated && course.destination?.id === city.id) })).filter(group => group.routes.length);
  const travelers = courses.filter(course => !course.curated);
  const sections = [...groups.map(({ city, routes }) => ({ id: `city-${city.id}`, name: tFor(city.key, 'en'), note: '', routes })),
    ...(travelers.length ? [{ id: 'travelers', name: 'Shared by travelers', note: '<p class="muted">Names and notes may be in their original language.</p>', routes: travelers }] : [])];
  return shell('Short travel routes for your first days in a new city', 'Explore short city routes, copy local addresses or place names and plan around your own dates.', `${origin}/en/routes`,
    `<h1>Find your first route</h1><p>Browse places, then build a trip around your own dates and starting point.</p>
    <nav aria-label="Cities"><ul class="cities">${sections.map(section => `<li><a href="#${section.id}">${e(section.name)}</a></li>`).join('')}</ul></nav>
    ${sections.map(section => `<section id="${section.id}"><h2>${e(section.name)}</h2>${section.note}${section.routes.map(card).join('')}</section>`).join('')}`);
}

export function renderRouteError(status, origin) {
  const unavailable = status === 503;
  // A 404 is either a removed route or a mistyped address (also any /en/... outside the routes).
  return shell(unavailable ? 'Route temporarily unavailable' : 'Page not found', 'Explore other travel routes.', `${origin}/en/routes`,
    `<h1>${unavailable ? 'Please try again shortly' : 'We could not find this page'}</h1><p>${unavailable ? 'We could not check the current route. Reload this page to retry.' : 'The route may no longer be public, or the address may be mistyped.'}</p><a href="/en/routes">Explore other routes</a>`, { noindex: true });
}
