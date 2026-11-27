import { getUserItineraries } from '../services/firestore-service.js';
import { offlineTrips } from '../services/offline-trips.mjs';
import { upcomingTrip, tripGlance } from '../services/upcoming-trip.mjs';
import { normalizeData } from '../services/itinerary-normalize.mjs';
import { buildItineraryTitle, formatDateRange } from '../services/itinerary-title.mjs';
import { t, getLang } from '../../../utils/i18n.js';

// Home's card for the signed-in user's nearest saved trip. Nothing shows without one, or when loading fails.
class UpcomingTrip extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.render = this.render.bind(this);
    this.run = 0;
  }

  connectedCallback() {
    window.addEventListener('i18n-changed', this.render);
    void this.load();
  }

  disconnectedCallback() {
    window.removeEventListener('i18n-changed', this.render);
    this.run += 1;
  }

  async load() {
    const uid = this.getAttribute('uid');
    const run = ++this.run;
    this.trip = null;
    this.render();
    if (!uid) return;
    try {
      const items = navigator.onLine === false ? offlineTrips.list(uid) : await getUserItineraries(uid);
      if (run !== this.run) return;
      this.trip = upcomingTrip(items, new Date());
      this.render();
    } catch {
      // getUserItineraries already logs; home stays free of an error for this optional card.
    }
  }

  render() {
    const root = this.shadowRoot;
    this.hidden = !this.trip;
    // Home's stylesheet reads this: while a trip shows, its button is the screen's one filled primary, not 일정 만들기.
    // A positive attribute, so 일정 만들기 stays filled before this element is defined or when loading fails.
    this.toggleAttribute('trip', Boolean(this.trip));
    if (!this.trip) { root.replaceChildren(); return; }
    const { item, daysUntil, dayNumber } = this.trip;
    const lang = getLang();
    const title = item.title || buildItineraryTitle(item.itineraryPlan, lang);
    root.innerHTML = `<style>
      :host { display:block; margin-top:20px; color:var(--cp-ink); font-family:var(--cp-font); }
      :host([hidden]) { display:none; }
      section { display:flex; flex-direction:column; gap:12px; padding:16px; border:1px solid var(--cp-rule); border-radius:var(--cp-radius); background:var(--cp-surface); text-align:left; }
      p { margin:0; font-size:13px; color:var(--cp-ink-2); }
      p + p { margin-top:2px; }
      .status { font-weight:700; color:var(--cp-ink); }
      h2 { margin:4px 0; font-size:18px; overflow-wrap:anywhere; word-break:keep-all; }
      button { width:100%; min-height:44px; padding:8px 14px; border:1px solid var(--cp-ink); border-radius:var(--cp-radius); background:var(--cp-ink); color:var(--cp-surface); font:inherit; font-size:15px; font-weight:700; cursor:pointer; }
      button:focus-visible { outline:3px solid var(--cp-ink); outline-offset:3px; }
    </style>
    <section aria-labelledby="trip-title"><div><p class="status"></p><h2 id="trip-title"></h2><p class="dates"></p><p class="first" hidden></p></div><button type="button"></button></section>`;
    root.querySelector('.status').textContent = daysUntil < 0
      ? t('upcomingTripOngoing').replace('{0}', dayNumber)
      : `${t('upcomingTripLabel')} · ${daysUntil ? `D-${daysUntil}` : 'D-day'}`;
    root.querySelector('h2').textContent = title;
    const days = normalizeData(item.itineraryPlan).days;
    const glance = tripGlance(item.itineraryPlan, dayNumber ? dayNumber - 1 : 0);
    root.querySelector('.dates').textContent = `${formatDateRange(days, lang === 'ko')} · ${
      t('upcomingTripCounts').replace('{0}', glance.stops).replace('{1}', glance.reservations)}`;
    if (glance.first) {
      const first = root.querySelector('.first');
      const day = days.length > 1 ? `${t('day_n').replace('{0}', glance.first.dayIndex + 1)} ` : '';
      first.textContent = t('upcomingTripFirst').replace('{0}', `${day}${glance.first.time} ${glance.first.name}`);
      first.hidden = false;
    }
    const view = root.querySelector('button');
    // daysUntil counts from the destination's own date, as the trip view does; 0 or less is a trip day.
    const open = t(daysUntil > 0 ? 'upcomingTripOpen' : 'upcomingTripToday');
    view.textContent = open;
    view.setAttribute('aria-label', `${open}: ${title}`);
    // Same address as the profile trip list's 보기, including the offline snapshot when there is no connection.
    view.addEventListener('click', () => window.navigate(`/view/${item.id}${navigator.onLine === false ? '?offline=1' : ''}`));
  }
}

customElements.define('upcoming-trip', UpcomingTrip);
