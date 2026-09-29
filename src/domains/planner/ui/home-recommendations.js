import { t, applyTranslations } from '../../../utils/i18n.js';
import { icons } from '../../../ui/icons.js';
import { trackEvent } from '../../../utils/analytics.js';
import { plannerDraftStore } from '../services/planner-draft.mjs';

// Curated starting places, not a popularity ranking or live crowd measurement.
// Addresses/descriptions checked against the linked Visit Seoul guides, 2026-09-29.
const places = [
  { id: 'palace', key: 'discoverPalace', icon: 'camera',
    guide: 'https://english.visitseoul.net/PalaceArea/Gyeongbokgung/ENP000072' },
  { id: 'forest', key: 'discoverForest', icon: 'healing',
    guide: 'https://english.visitseoul.net/nature/Seoul%20Forest/ENP001838' },
  { id: 'island', key: 'discoverIsland', icon: 'map',
    guide: 'https://english.visitseoul.net/attractions/SeonyudoPark/ENP000378' },
];

class HomeRecommendations extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.selectedIds = [];
    this.updateTexts = () => { applyTranslations(this.shadowRoot); this.renderSelection(); };
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
        a { display: inline-flex; align-items: center; align-self: flex-start; min-height: 44px; margin-top: 8px; font-size: 12px; color: var(--cp-ink-2); text-underline-offset: 3px; }
        :is(button, a):focus-visible { outline: 2px solid var(--cp-ink); outline-offset: 4px; }
      </style>
      <section aria-labelledby="discover-title">
        <p class="eyebrow" data-i18n="discoverEyebrow"></p>
        <h2 id="discover-title" data-i18n="discoverTitle"></h2>
        <p class="intro" data-i18n="discoverDescription"></p>
        <div class="cards">
          ${places.map((place, index) => `
            <article aria-labelledby="${place.id}-name">
              <div class="top">${icons[place.icon]}<span class="number" aria-hidden="true">0${index + 1} / SEOUL</span></div>
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
            </article>`).join('')}
        </div>
        <div class="selection">
          <p id="discover-selection" role="status" aria-live="polite"></p>
          <button type="button" id="discover-plan" disabled><span data-i18n="discoverPlan"></span>${icons.route}</button>
        </div>
      </section>`;
    this.shadowRoot.addEventListener('click', event => {
      const place = places.find(place => place.id === event.target.closest('button[data-place]')?.dataset.place);
      if (place) {
        this.selectedIds = this.selectedIds.includes(place.id)
          ? this.selectedIds.filter(id => id !== place.id)
          : [...this.selectedIds, place.id].slice(0, 2);
        this.renderSelection();
        return;
      }
      if (event.target.closest('#discover-plan') && this.selectedIds.length && typeof window.navigate === 'function') {
        const selected = this.selectedIds.map(id => places.find(place => place.id === id));
        const draft = plannerDraftStore.read();
        plannerDraftStore.save({ ...draft, startLocation: t(`${selected[0].key}Location`),
          ...(selected[1] ? { endLocation: t(`${selected[1].key}Location`) } : {}) });
        trackEvent('home_recommendation_select', { place_ids: this.selectedIds.join(',') });
        window.navigate('/login?next=%2Fpreference%2F1');
      }
    });
  }

  renderSelection() {
    this.shadowRoot.querySelectorAll('button[data-place]').forEach(button => {
      const selected = this.selectedIds.includes(button.dataset.place);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = !selected && this.selectedIds.length === 2;
      button.querySelector('span').textContent = t(selected ? 'discoverRemove' : 'discoverSelect');
    });
    this.shadowRoot.getElementById('discover-selection').textContent = this.selectedIds.length
      ? t('discoverSelectedCount').replace('{0}', String(this.selectedIds.length))
      : t('discoverSelectHint');
    this.shadowRoot.getElementById('discover-plan').disabled = this.selectedIds.length === 0;
  }

  connectedCallback() {
    this.updateTexts();
    window.addEventListener('i18n-changed', this.updateTexts);
  }

  disconnectedCallback() {
    window.removeEventListener('i18n-changed', this.updateTexts);
  }
}

customElements.define('home-recommendations', HomeRecommendations);
