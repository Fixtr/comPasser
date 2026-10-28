import { escapeHtml as e, safeHttpUrl } from '../../../utils/html-safety.mjs';
import { publicRouteUrl } from './public-route.mjs';
import { courseCity } from './course-community.mjs';

const styles = `
  :root{color-scheme:light;--ink:#17201c;--paper:#f4f4f1}*{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.65 system-ui,sans-serif}
  main,header,footer{max-width:850px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:20px}
  h1{font-size:clamp(2rem,6vw,3.2rem);line-height:1.12}h2{font-size:1.35rem}a{color:inherit}
  article,.share{border:1px solid #c8ccc5;background:#fff;padding:24px;margin:20px 0;overflow-wrap:anywhere}
  button,.action{display:inline-block;padding:12px 18px;min-height:44px;border:1px solid var(--ink);background:var(--ink);color:white;font:inherit;text-decoration:none;cursor:pointer}
  button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #145ca3;outline-offset:3px}
  .actions{display:flex;flex-wrap:wrap;gap:12px}.muted{color:#515b54}.address{user-select:all}img{max-width:100%;height:auto}
  label{display:block}input{display:block;min-height:44px;width:100%;padding:10px;font:inherit;margin:8px 0 16px}
  .qr{width:190px}.share code{display:block;overflow-wrap:anywhere}footer{font-size:.9rem}
  @media print{header,.actions,.start,footer,button{display:none}body{background:white}main{padding:0}article{break-inside:avoid}.share{border:0}}
`;

function shell(title, description, canonical, body, { noindex = false, script = '' } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${e(title)} | ComPasser</title><meta name="description" content="${e(description)}">
    <link rel="canonical" href="${e(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)}">
    <meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(canonical)}">
    ${noindex ? '<meta name="robots" content="noindex">' : ''}<link rel="icon" href="/favicon.svg"><style>${styles}</style></head>
    <body><header><a href="/en/routes">ComPasser · Travel routes</a><a href="/home?lang=en">Build your trip</a></header>
    <main>${body}</main><footer>Choose your own dates, accommodation and fixed appointments when you build a trip.</footer>${script}</body></html>`;
}

export function renderPublicRoute(course, origin) {
  const canonical = publicRouteUrl(course.id, origin);
  const title = course.titleEn || course.title;
  const names = course.stops.map(stop => stop.englishName || stop.name);
  const description = `${names.join(' → ')}. Choose your dates and starting place to plan your visit.`;
  const stopHtml = course.stops.map((stop, index) => {
    const info = stop.visitorInfo;
    const menu = { available: 'Available', unavailable: 'Not available', unknown: 'Not checked' };
    const reservation = { required: 'Required', recommended: 'Recommended', not_required: 'Not required', unknown: 'Not checked' };
    const source = info && safeHttpUrl(info.sourceUrl);
    return `<article><h2>${index + 1}. ${e(stop.englishName || stop.name)}</h2>
      ${stop.englishName && stop.englishName !== stop.name ? `<p>${e(stop.name)}</p>` : ''}
      <p>${e(stop.stayMinutes)} minutes suggested visit time · excludes travel</p>
      ${stop.englishAddress ? `<p>${e(stop.englishAddress)}</p>` : ''}<p class="address">${e(stop.location)}</p>
      <button type="button" class="copy-address" data-address="${e(stop.location)}">Copy local address</button>
      <p>English menu: ${e(source ? menu[info.englishMenu] || 'Not checked' : 'Not checked')}<br>
      Reservation: ${e(source ? reservation[info.reservation] || 'Not checked' : 'Not checked')}</p>
      ${source ? `<p class="muted">Checked by the route publisher on ${e(info.checkedOn)}. <a href="${e(source)}" target="_blank" rel="noopener noreferrer">Read the source</a>. Confirm details before visiting.</p>` : '<p class="muted">Menu and reservation information has not been checked.</p>'}
      ${safeHttpUrl(stop.guideUrl) ? `<a href="${e(safeHttpUrl(stop.guideUrl))}" target="_blank" rel="noopener noreferrer">Official visitor guide</a>` : ''}</article>`;
  }).join('');
  const credit = course.credit;
  const creditHtml = credit?.name ? `<p>Shared by ${safeHttpUrl(credit.url) ? `<a href="${e(safeHttpUrl(credit.url))}" target="_blank" rel="noopener noreferrer">${e(credit.name)}</a>` : e(credit.name)}</p>` : '';
  return shell(title, description, canonical, `<p>${course.curated ? 'Curated route' : 'Traveler route · names and notes may be in their original language'}</p>
    <h1>${e(title)}</h1>${creditHtml}<p>${e(course.review || '')}</p>${stopHtml}
    <section class="start"><label for="start-location">Start near your accommodation (optional)</label>
    <input id="start-location" maxlength="200" placeholder="Enter a hotel, station or address"></section>
    <div class="actions"><a class="action" id="plan-route" href="/home?course=${e(course.id)}&amp;lang=en" data-city="${e(course.destination?.id || courseCity(course) || '')}">Plan with these places</a>
      ${course.curated ? '' : `<a href="/courses?review=${e(course.id)}&amp;lang=en">Traveler reviews</a>`}</div>
    <p class="muted">Building the itinerary needs an account. Places become required visits. Check travel times and opening hours in your generated itinerary.</p>
    <section class="share"><h2>Share this route</h2><p>Use this link in a video, travel post or accommodation guide.</p>
      <code>${e(canonical)}</code><img class="qr" src="/en/routes/${e(course.id)}/qr.svg" alt="QR code for this route" width="190" height="190">
      <div class="actions"><button id="copy-link" type="button">Copy link</button><a href="/en/routes/${e(course.id)}/qr.svg?download=1">Download QR</a><button id="print-route" type="button">Print route and QR</button></div>
      <p id="route-status" role="status" aria-live="polite"></p></section>`, { script: '<script src="/route-page.js" defer></script>' });
}

export function renderRouteDirectory(courses, origin) {
  return shell('Travel routes for your first days in Korea', 'Explore short routes in Korea, copy local addresses and plan around your own dates.', `${origin}/en/routes`,
    `<h1>Find your first route in Korea</h1><p>Browse places, then build a trip around your own dates and starting point.</p>${courses.map(course =>
      `<article><h2><a href="${e(publicRouteUrl(course.id, origin))}">${e(course.titleEn || course.title)}</a></h2><p>${e(course.stops.map(stop => stop.englishName || stop.name).join(' → '))}</p></article>`).join('')}`);
}

export function renderRouteError(status, origin) {
  const unavailable = status === 503;
  return shell(unavailable ? 'Route temporarily unavailable' : 'This route is no longer public', 'Explore other routes in Korea.', `${origin}/en/routes`,
    `<h1>${unavailable ? 'Please try again shortly' : 'This route is no longer public'}</h1><p>${unavailable ? 'We could not check the current route. Reload this page to retry.' : 'The publisher may have removed it.'}</p><a href="/en/routes">Explore other routes</a>`, { noindex: true });
}
