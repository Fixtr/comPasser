import { t, applyTranslations } from '../../../utils/i18n.js';
import { icons } from '../../../ui/icons.js';
import { trackEvent } from '../../../utils/analytics.js';
import { plannerDraftStore } from '../services/planner-draft.mjs';

// Curated places, not a popularity ranking or live crowd measurement.
// Addresses and guides checked against official Visit Seoul, VISITKOREA and Visit Jeju pages, 2026-09-30.
const cities = [
  { id: 'seoul', key: 'discoverSeoul', places: [
    { id: 'palace', key: 'discoverPalace', icon: 'camera', guide: 'https://english.visitseoul.net/PalaceArea/Gyeongbokgung/ENP000072' },
    { id: 'forest', key: 'discoverForest', icon: 'healing', guide: 'https://english.visitseoul.net/nature/Seoul%20Forest/ENP001838' },
    { id: 'island', key: 'discoverIsland', icon: 'map', guide: 'https://english.visitseoul.net/attractions/SeonyudoPark/ENP000378' },
  ] },
  { id: 'busan', key: 'discoverBusan', places: [
    { id: 'haeundae', key: 'discoverHaeundae', icon: 'map', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=111053' },
    { id: 'dongbaek', key: 'discoverDongbaek', icon: 'healing', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=81541' },
    { id: 'gwangalli', key: 'discoverGwangalli', icon: 'camera', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=219&vcontsId=228475' },
  ] },
  { id: 'jeju', key: 'discoverJeju', places: [
    { id: 'yongduam', key: 'discoverYongduam', icon: 'camera', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500469' },
    { id: 'dongmun', key: 'discoverDongmun', icon: 'map', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500745' },
    { id: 'iho', key: 'discoverIho', icon: 'healing', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CNTS_200000000007344' },
  ] },
];
const ROTATION_MS = 12000;

class HomeRecommendations extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.selectedIds = [];
    this.cityIndex = 0;
    this.updateTexts = () => {
      this.renderCards();
      applyTranslations(this.shadowRoot);
      this.shadowRoot.getElementById('discover-eyebrow').textContent = `${t('discoverEyebrow')} · ${t(cities[this.cityIndex].key)}`;
      this.renderSelection();
    };
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; text-align: left; color: var(--cp-ink); font-family: var(--cp-font); }
        * { box-sizing: border-box; }
        section { padding-top: 40px; }
        .eyebrow { margin: 0 0 10px; font: 600 12px/1.5 var(--cp-mono); letter-spacing: .08em; color: var(--cp-muted); }
        h2 { margin: 0; font-size: clamp(1.4rem, 4vw, 1.8rem); line-height: 1.3; letter-spacing: -.035em; }
        .intro { margin: 12px 0 24px; max-width: 42rem; color: var(--cp-ink-2); font-size: 15px; line-height: 1.65; }
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 14px; }
        article { display: flex; flex-direction: column; min-width: 0; padding: 24px; border: 1px solid var(--cp-rule); background: var(--cp-surface); }
        .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
        .top svg { width: 32px; height: 32px; }
        .number { font: 12px var(--cp-mono); color: var(--cp-muted); }
        .tag { margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: var(--cp-ink-2); }
        h3 { margin: 0 0 6px; font-size: 23px; line-height: 1.25; letter-spacing: -.03em; overflow-wrap: anywhere; }
        .area { margin: 0; font-size: 12px; line-height: 1.5; color: var(--cp-muted); }
        .description { flex: 1; margin: 20px 0; font-size: 14px; line-height: 1.7; color: var(--cp-ink-2); word-break: keep-all; overflow-wrap: anywhere; }
        button { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; min-height: 48px; padding: 12px; border: 1px solid var(--cp-ink); border-radius: 0; background: var(--cp-ink); color: var(--cp-surface); cursor: pointer; font: 600 14px/1.5 var(--cp-font); text-align: left; }
        button:hover { background: var(--cp-surface); color: var(--cp-ink); }
        button[aria-pressed="true"] { background: var(--cp-surface); color: var(--cp-ink); box-shadow: inset 0 0 0 2px var(--cp-ink); }
        button:disabled { opacity: .5; cursor: not-allowed; }
        button svg { flex: none; }
        .selection { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 18px; }
        .selection p { flex: 1; min-width: 180px; margin: 0; color: var(--cp-ink-2); font-size: 14px; }
        .selection button { width: auto; min-width: 160px; justify-content: center; }
        .cities { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 22px; }
        .cities button { width: auto; min-width: 88px; justify-content: center; }
        .rotation-hint { margin: -10px 0 18px; color: var(--cp-muted); font-size: 12px; }
        a { display: inline-flex; align-items: center; align-self: flex-start; min-height: 44px; margin-top: 8px; font-size: 12px; color: var(--cp-ink-2); text-underline-offset: 3px; }
        :is(button, a):focus-visible { outline: 2px solid var(--cp-ink); outline-offset: 4px; }
      </style>
      <section aria-labelledby="discover-title">
        <p class="eyebrow" id="discover-eyebrow"></p>
        <h2 id="discover-title" data-i18n="discoverTitle"></h2>
        <p class="intro" data-i18n="discoverDescription"></p>
        <div class="cities" role="group" data-i18n-aria="discoverCitiesLabel">
          ${cities.map(city => `<button type="button" data-city="${city.id}" data-i18n="${city.key}" aria-pressed="false"></button>`).join('')}
        </div>
        <p class="rotation-hint" data-i18n="discoverRotationHint"></p>
        <div class="cards"></div>
        <div class="selection">
          <p id="discover-selection" role="status" aria-live="polite"></p>
          <button type="button" id="discover-plan" disabled><span data-i18n="discoverPlan"></span>${icons.route}</button>
        </div>
      </section>`;
    this.shadowRoot.addEventListener('click', event => {
      const cityButton = event.target.closest('button[data-city]');
      if (cityButton) {
        this.showCity(cities.findIndex(city => city.id === cityButton.dataset.city));
        this.startRotation();
        return;
      }
      const places = cities[this.cityIndex].places;
      const place = places.find(place => place.id === event.target.closest('button[data-place]')?.dataset.place);
      if (place) {
        this.selectedIds = this.selectedIds.includes(place.id)
          ? this.selectedIds.filter(id => id !== place.id)
          : [...this.selectedIds, place.id].slice(0, 3);
        this.renderSelection();
        return;
      }
      if (event.target.closest('#discover-plan') && this.selectedIds.length && typeof window.navigate === 'function') {
        const selected = this.selectedIds.map(id => places.find(place => place.id === id));
        const draft = plannerDraftStore.read();
        const anchorSchedules = [...draft.anchorSchedules];
        selected.forEach(place => {
          const name = t(`${place.key}Name`);
          const location = t(`${place.key}Location`);
          if (!anchorSchedules.some(anchor => anchor.name === name && anchor.location === location)) {
            anchorSchedules.push({ day: 1, name, location, time: '', endTime: '' });
          }
        });
        plannerDraftStore.save({ ...draft, anchorSchedules, selectedWaypoints: [] });
        trackEvent('home_recommendation_select', { place_ids: this.selectedIds.join(',') });
        window.navigate('/login?next=%2Fpreference%2F1');
      }
    });
  }

  renderCards() {
    const city = cities[this.cityIndex];
    this.shadowRoot.querySelector('.cards').innerHTML = city.places.map((place, index) => `
      <article aria-labelledby="${place.id}-name">
        <div class="top">${icons[place.icon]}<span class="number" aria-hidden="true">0${index + 1} / ${city.id.toUpperCase()}</span></div>
        <p class="tag" data-i18n="${place.key}Tag"></p>
        <h3 id="${place.id}-name" data-i18n="${place.key}Name"></h3>
        <p class="area" data-i18n="${place.key}Area"></p>
        <p class="description" data-i18n="${place.key}Description"></p>
        <button type="button" data-place="${place.id}" aria-pressed="false" aria-labelledby="${place.id}-start ${place.id}-name">
          <span id="${place.id}-start"></span>${icons.route}
        </button>
        <a href="${place.guide}" target="_blank" rel="noopener noreferrer" aria-labelledby="${place.id}-guide ${place.id}-name">
          <span id="${place.id}-guide" data-i18n="discoverGuide"></span>
        </a>
      </article>`).join('');
  }

  showCity(index) {
    if (index < 0 || index >= cities.length || index === this.cityIndex) return;
    this.cityIndex = index;
    this.selectedIds = [];
    this.updateTexts();
  }

  startRotation() {
    clearInterval(this.rotationTimer);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.rotationTimer = setInterval(() => {
      if (!document.hidden && this.getClientRects().length && !this.matches(':hover, :focus-within') && !this.selectedIds.length) {
        this.showCity((this.cityIndex + 1) % cities.length);
      }
    }, ROTATION_MS);
  }

  renderSelection() {
    this.shadowRoot.querySelectorAll('button[data-city]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.city === cities[this.cityIndex].id)));
    this.shadowRoot.querySelectorAll('button[data-place]').forEach(button => {
      const selected = this.selectedIds.includes(button.dataset.place);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = !selected && this.selectedIds.length === 3;
      button.querySelector('span').textContent = t(selected ? 'discoverRequiredSelected' : 'discoverSelect');
    });
    this.shadowRoot.getElementById('discover-selection').textContent = this.selectedIds.length
      ? t('discoverSelectedCount').replace('{0}', String(this.selectedIds.length))
      : t('discoverSelectHint');
    this.shadowRoot.getElementById('discover-plan').disabled = this.selectedIds.length === 0;
  }

  connectedCallback() {
    this.updateTexts();
    this.startRotation();
    window.addEventListener('i18n-changed', this.updateTexts);
  }

  disconnectedCallback() {
    clearInterval(this.rotationTimer);
    window.removeEventListener('i18n-changed', this.updateTexts);
  }
}

customElements.define('home-recommendations', HomeRecommendations);
