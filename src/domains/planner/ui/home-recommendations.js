import { t, tFor, getLang, applyTranslations } from '../../../utils/i18n.js';
import { icons } from '../../../ui/icons.js';
import { trackEvent } from '../../../utils/analytics.js';
import { plannerDraftStore } from '../services/planner-draft.mjs';
import { countCourseMentions } from '../services/course-mentions.mjs';
import { resolveDestinationPlace, destinationPlaceError } from '../services/destination-place.js';

import { cities } from '../services/discovery-catalogue.mjs';
export { cities };
const photoLicenses = {
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
  'CC BY-SA 2.0': 'https://creativecommons.org/licenses/by-sa/2.0/',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
};
const photos = {
  palace: { file: 'File:Front view of the Imperial Throne Hall Geunjeongjeon at Gyeongbokgung Palace with blue sky in Seoul.jpg', author: 'Basile Morin', license: 'CC BY-SA 4.0' },
  forest: { file: 'File:Flowers in Seoul Forest Park.jpg', author: 'Rachel.zrq', license: 'CC0 1.0' },
  island: { file: 'File:Seonyudo Park.jpg', author: 'traveloriented', license: 'CC BY-SA 2.0' },
  haeundae: { file: 'File:Haeundae Beach in Busan.jpg', author: 'StephNurnberg', license: 'CC BY 2.0' },
  dongbaek: { file: 'File:Dongbaekseom island, Busan.jpg', author: 'Brit in Seoul', license: 'CC BY-SA 4.0' },
  gwangalli: { file: 'File:Gwangalli Beach and Gwangan Bridge Busan.jpg', author: 'Masterhatch', license: 'CC BY-SA 4.0' },
  yongduam: { file: 'File:Yongduam in jeju.jpg', author: 'Jeong seolah', license: 'CC0 1.0' },
  dongmun: { file: 'File:Jeju Dongmun Traditional Market 01.jpg', author: 'Grapesurgeon', license: 'CC BY-SA 4.0' },
  iho: { file: 'File:Dragon lighthouse (5223468346).jpg', author: 'garycycles', license: 'CC BY 2.0' },
  chinatown: { file: 'File:Incheon Chinatown.jpg', author: 'Riodamascus', license: 'CC BY-SA 4.0' },
  jayu: { file: 'File:Jayu Park 20230430 009.jpg', author: 'Mobius6', license: 'CC BY-SA 4.0' },
  songdo: { file: 'File:Songdo Central Park in 2021.jpg', author: 'José Carioca', license: 'CC BY-SA 4.0' },
  seomun: { file: 'File:Seomun Market Gate.JPG', author: 'hyolee2', license: 'CC BY-SA 4.0' },
  gyesan: { file: 'File:Our Lady of Lourdes Cathedral, Daegu.jpg', author: 'Šolon', license: 'CC BY-SA 4.0' },
  dongseongro: { file: 'File:Dongseongro Rodeo Street on February 20th, 2016.jpg', author: 'Choi2451', license: 'CC BY-SA 4.0' },
  hanbat: { file: 'File:Hanbat Aboretum Garden under the Moon.jpg', author: 'Ryuch', license: 'CC BY-SA 4.0' },
  expo: { file: 'File:Gate, bridge, and tower at Daejeon Expo Science Park.jpg', author: 'Yoo Chung', license: 'CC BY-SA 3.0' },
  yuseong: { file: 'File:People take a foot bath at an outdoor public hot spring in Yuseong-gu, Daejeon, Korea.jpg', author: 'Pmlydon', license: 'CC BY-SA 4.0' },
};

class HomeRecommendations extends HTMLElement {
  static get observedAttributes() { return ['city']; }
  attributeChangedCallback() {
    const index = cities.findIndex(city => city.id === this.getAttribute('city'));
    if (index >= 0) this.showCity(index);
    this.shadowRoot.querySelector('.cities').hidden = this.hasAttribute('city');
  }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.selectedIds = [];
    this.placeLookupVersion = 0;
    this.cityIndex = 0;
    this.filter = 'all';
    this.courseMentions = {};
    this.courseSampleSize = 0;
    this.courseStatus = 'loading';
    this.crowd = undefined;
    this.popularity = {};
    this.savedIds = [];
    this.popularityStatus = 'loading';
    this.updateTexts = () => {
      this.renderCards();
      this.renderCrowd();
      this.renderCourseStatus();
      this.renderPopularityStatus();
      applyTranslations(this.shadowRoot);
      this.shadowRoot.getElementById('discover-eyebrow').textContent = `${t('discoverEyebrow')} · ${t(cities[this.cityIndex].key)}`;
      this.renderSelection();
    };
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; text-align: left; color: var(--cp-ink); font-family: var(--cp-font); }
        :host([city]) .cities { display: none; }
        * { box-sizing: border-box; }
        section { padding-top: 24px; }
        .eyebrow { margin: 0 0 10px; font: 600 12px/1.5 var(--cp-mono); letter-spacing: .08em; color: var(--cp-muted); }
        h2 { margin: 0; font-size: clamp(1.4rem, 4vw, 1.8rem); line-height: 1.3; letter-spacing: -.035em; }
        .intro { margin: 12px 0 24px; max-width: 42rem; color: var(--cp-ink-2); font-size: 15px; line-height: 1.65; }
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 14px; }
        article { display: flex; flex-direction: column; min-width: 0; padding: 24px; border: 1px solid var(--cp-rule); background: var(--cp-surface); }
        .photo { margin: -24px -24px 20px; }
        .photo img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; background: var(--cp-rule); }
        .photo figcaption { padding: 6px 24px 0; color: var(--cp-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
        .photo a { color: inherit; text-underline-offset: 2px; }
        .place-details { margin: 14px 0; }
        .place-details summary { min-height: 44px; padding: 10px 0; cursor: pointer; font-size: 13px; color: var(--cp-ink-2); }
        .place-details .photo { margin: 12px 0; }
        .place-details .photo figcaption { padding: 6px 0 0; }
        .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
        .number { font: 12px var(--cp-mono); color: var(--cp-muted); }
        .tag { margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: var(--cp-ink-2); }
        .evidence { margin: 0 0 12px; color: var(--cp-ink-2); font-size: 12px; line-height: 1.5; }
        .provenance { margin: 6px 0; color: var(--cp-muted); font-size: 12px; line-height: 1.5; }
        .criteria-details { margin: 0 0 16px; font-size: 12px; color: var(--cp-muted); border: 1px solid var(--cp-rule); padding: 10px 14px; background: var(--cp-surface); }
        .criteria-details summary { cursor: pointer; font-weight: 600; color: var(--cp-ink-2); user-select: none; }
        .criteria-details[open] summary { margin-bottom: 8px; }
        .crowd { margin: 0 0 18px; padding: 14px 16px; border: 1px solid var(--cp-rule); background: var(--cp-surface); font-size: 12px; line-height: 1.6; }
        .crowd p { margin: 0 0 4px; }
        .crowd a { color: inherit; text-underline-offset: 3px; }
        .kind { margin: 0; padding: 4px 8px; border: 1px solid var(--cp-rule); color: var(--cp-ink-2); font: 600 11px/1.5 var(--cp-mono); }
        h3 { margin: 0 0 6px; font-size: 23px; line-height: 1.25; letter-spacing: -.03em; overflow-wrap: anywhere; }
        .area { margin: 0; font-size: 12px; line-height: 1.5; color: var(--cp-muted); }
        .description { flex: 1; margin: 20px 0; font-size: 14px; line-height: 1.7; color: var(--cp-ink-2); word-break: keep-all; overflow-wrap: anywhere; }
        .stay { margin: 0 0 14px; color: var(--cp-muted); font-size: 12px; line-height: 1.5; }
        button { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; min-height: 48px; padding: 12px; border: 1px solid var(--cp-ink); border-radius: 0; background: var(--cp-ink); color: var(--cp-surface); cursor: pointer; font: 600 14px/1.5 var(--cp-font); text-align: left; }
        button:hover { background: var(--cp-surface); color: var(--cp-ink); }
        button[aria-pressed="true"] { background: var(--cp-surface); color: var(--cp-ink); box-shadow: inset 0 0 0 2px var(--cp-ink); }
        button:disabled { opacity: .5; cursor: not-allowed; }
        button svg { flex: none; }
        .selection { position: sticky; bottom: 16px; background: var(--cp-surface); border: 1px solid var(--cp-rule); padding: 20px 24px; margin-top: 24px; z-index: 10; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
        .selection p { flex: 1; min-width: min(100%, 180px); margin: 0; color: var(--cp-ink-2); font-size: 14px; }
        .selection button { width: auto; min-width: min(100%, 160px); justify-content: center; }
        .selected-list:empty { display: none; }
        @media (max-width: 600px) {
          .selection { padding: 16px; gap: 12px; bottom: 12px; }
          .selection button { width: 100%; }
        }
        .cities { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 22px; }
        .cities button { width: auto; min-width: 88px; justify-content: center; background: var(--cp-surface); color: var(--cp-ink); border-color: var(--cp-rule); }
        .cities button:hover { background: var(--cp-paper); }
        .cities button[aria-pressed="true"] { background: var(--cp-ink); color: var(--cp-surface); border-color: var(--cp-ink); box-shadow: none; }
        .filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
        .filters button { width: auto; min-width: 0; min-height: 44px; padding: 8px 12px; border-color: var(--cp-rule); background: var(--cp-surface); color: var(--cp-ink); }
        .filters button[aria-pressed="true"] { border-color: var(--cp-ink); background: var(--cp-ink); color: var(--cp-surface); box-shadow: none; }
        .cards.is-filtered { grid-template-columns: repeat(2, minmax(0, 360px)); }
        @media (max-width: 600px) {
          .cards.is-filtered { gap: 10px; }
          .cards.is-filtered article { padding: 12px; }
          .cards.is-filtered .top { flex-wrap: wrap; }
          .cards.is-filtered h3 { font-size: 18px; }
          .cards.is-filtered button { padding: 8px; }
        }
        button[data-save] { margin-top: 8px; background: var(--cp-surface); color: var(--cp-ink); justify-content: center; }
        .selected-list { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
        .selected-list button { width: auto; min-height: 44px; padding: 8px 12px; background: var(--cp-surface); color: var(--cp-ink); }
        .guide { display: inline-flex; align-items: center; align-self: flex-start; min-height: 44px; margin-top: 8px; font-size: 12px; color: var(--cp-ink-2); text-underline-offset: 3px; }
        :is(button, a, summary):focus-visible { outline: 2px solid var(--cp-ink); outline-offset: 4px; }
      </style>
      <section aria-labelledby="discover-title">
        <p class="eyebrow" id="discover-eyebrow"></p>
        <h2 id="discover-title" data-i18n="discoverTitle"></h2>
        <p class="intro" data-i18n="discoverDescription"></p>
        <div class="cities" role="group" data-i18n-aria="discoverCitiesLabel">
          ${cities.map(city => `<button type="button" data-city="${city.id}" data-i18n="${city.key}" aria-pressed="false"></button>`).join('')}
        </div>
        <div class="filters" role="group" data-i18n-aria="discoverFiltersLabel">
          ${[['all', 'discoverFilterAll'], ['popular', 'discoverFilterPopular'], ['discoverLandmark', 'discoverLandmark'], ['discoverFind', 'discoverFind'], ['discoverWalk', 'discoverWalk']]
            .map(([filter, key]) => `<button type="button" data-filter="${filter}" data-i18n="${key}" aria-pressed="false"></button>`).join('')}
        </div>
        <details class="criteria-details">
          <summary data-i18n="discoverCriteria"></summary>
          <p class="provenance" data-i18n="discoverEditorialNote"></p>
          <p class="provenance" id="discover-course-status" role="status"></p>
          <p class="provenance" id="discover-popularity-status" role="status"></p>
        </details>
        <div class="crowd" role="status" aria-live="polite"></div>
        <div class="cards"></div>
        <div class="selection">
          <div class="selected-list" data-i18n-aria="discoverSelectedPlacesLabel"></div>
          <p id="discover-selection" role="status" aria-live="polite"></p>
          <button type="button" id="discover-plan" disabled><span data-i18n="discoverPlan"></span>${icons.route}</button>
        </div>
      </section>`;
    this.shadowRoot.addEventListener('click', async event => {
      if (this.resolvingPlaces) return;
      const saveButton = event.target.closest('button[data-save]');
      if (saveButton) { void this.toggleSaved(saveButton.dataset.save); return; }
      const cityButton = event.target.closest('button[data-city]');
      if (cityButton) {
        this.showCity(cities.findIndex(city => city.id === cityButton.dataset.city));
        return;
      }
      const filterButton = event.target.closest('button[data-filter]');
      if (filterButton) {
        this.filter = filterButton.dataset.filter;
        this.updateTexts();
        return;
      }
      const removeButton = event.target.closest('button[data-remove]');
      if (removeButton) {
        this.selectedIds = this.selectedIds.filter(id => id !== removeButton.dataset.remove);
        this.renderSelection();
        return;
      }
      const places = cities[this.cityIndex].places;
      const place = places.find(place => place.id === event.target.closest('button[data-place]')?.dataset.place);
      if (place) {
        const selected = this.selectedIds.includes(place.id);
        this.selectedIds = selected
          ? this.selectedIds.filter(id => id !== place.id)
          : [...this.selectedIds, place.id].slice(0, 3);
        this.renderSelection();
        return;
      }
      if (event.target.closest('#discover-plan') && typeof window.navigate === 'function') {
        const selected = this.selectedIds.map(id => places.find(place => place.id === id));
        if (this.hasAttribute('planner-pick')) {
          if (!selected.length) return;
          this.dispatchEvent(new CustomEvent('places-picked', { detail: selected.map(place => ({
            name: t(`${place.key}Name`), location: t(`${place.key}Location`),
            time: '', endTime: '', flexible: true, stayMinutes: Number.parseInt(place.stay, 10),
          })) }));
          return;
        }
        if (!selected.length) {
          const city = cities[this.cityIndex];
          plannerDraftStore.update({ step: '/preference/1', ...(this.hasAttribute('city') ? {
            country: 'KOR', destinationStage: 'places',
            destination: { id: city.id, country: 'KOR', name: `${tFor(city.key, 'en')}, ${tFor('countryKOR', 'en')}` },
          } : {}) });
          window.navigate('/login?next=%2Fpreference%2F1');
          return;
        }
        const version = ++this.placeLookupVersion;
        const pathname = window.location.pathname;
        this.resolvingPlaces = true;
        this.placeLookupError = '';
        this.renderSelection();
        let resolved;
        try {
          const city = { ...cities[this.cityIndex], country: 'KOR' };
          resolved = await Promise.all(selected.map(place => resolveDestinationPlace(city, place)));
          if (version !== this.placeLookupVersion || !this.isConnected || window.location.pathname !== pathname) return;
          if (resolved.some(place => !place)) throw new Error('Unverified destination place');
        } catch (error) {
          if (version === this.placeLookupVersion && this.isConnected) this.placeLookupError = destinationPlaceError(error);
          return;
        } finally {
          if (version === this.placeLookupVersion) {
            this.resolvingPlaces = false;
            if (this.isConnected) this.renderSelection();
          }
        }
        const draft = plannerDraftStore.read();
        const anchorSchedules = [...draft.anchorSchedules];
        selected.forEach((place, index) => {
          const name = t(`${place.key}Name`);
          const location = resolved[index];
          if (!anchorSchedules.some(anchor => anchor.location?.placeId === location.placeId || (anchor.name === name && anchor.location === t(`${place.key}Location`)))) {
            anchorSchedules.push({ day: 1, name, location, suggestionId: place.id, time: '', endTime: '',
              flexible: true, stayMinutes: Number.parseInt(place.stay, 10) });
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
    const cards = this.shadowRoot.querySelector('.cards');
    const expanded = new Set([...cards.querySelectorAll('details[open]')].map(details => details.dataset.placeDetails));
    cards.classList.toggle('is-filtered', !['all', 'popular'].includes(this.filter));
    const places = city.places.filter(place => !place.pairOnly && (['all', 'popular'].includes(this.filter) || place.kind === this.filter));
    if (this.filter === 'popular') places.sort((a, b) => (this.popularity[b.id]?.count || 0) - (this.popularity[a.id]?.count || 0));
    cards.innerHTML = places.map((place, index) => {
      const photo = photos[place.id];
      const statistic = this.popularity[place.id];
      const saved = this.savedIds.includes(place.id);
      const updated = statistic?.updatedAt ? new Intl.DateTimeFormat(getLang() === 'ko' ? 'ko-KR' : 'en-US', {
        timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }).format(new Date(statistic.updatedAt)) : '';
      return `
      <article aria-labelledby="${place.id}-name">
        <div class="top"><p class="kind">${t(place.kind)}</p><span class="number" aria-hidden="true">0${index + 1} / ${city.id.toUpperCase()}</span></div>
        <p class="tag" data-i18n="${place.key}Tag"></p>
        <h3 id="${place.id}-name" data-i18n="${place.key}Name"></h3>
        <p class="area" data-i18n="${place.key}Area"></p>
        ${this.popularityStatus === 'ready' ? `<p class="evidence">${t('discoverSavedCount').replace('{0}', statistic?.count || 0)}${updated ? ` · ${t('discoverSavedUpdated').replace('{0}', updated)}` : ''}</p>` : ''}
        ${this.courseMentions[place.id] ? `<p class="evidence">${t('discoverCourseMentions').replace('{0}', this.courseMentions[place.id]).replace('{1}', this.courseSampleSize)}</p>` : ''}
        <details class="place-details" data-place-details="${place.id}" ${expanded.has(place.id) ? 'open' : ''}>
        <summary aria-label="${t('discoverDetails')}: ${t(`${place.key}Name`)}">${t('discoverDetails')}</summary>
        ${photo ? `<figure class="photo">
          <img src="/discovery/${place.id}.jpg" alt="" loading="lazy" width="960" height="600">
          <figcaption><a href="https://commons.wikimedia.org/wiki/${encodeURIComponent(photo.file)}" target="_blank" rel="noopener noreferrer">${t('discoverPhotoCredit').replace('{0}', photo.author)}</a> · <a href="${photoLicenses[photo.license]}" target="_blank" rel="noopener noreferrer">${photo.license}</a></figcaption>
        </figure>` : ''}
        <p class="description"><strong>${t('discoverReason')} · </strong>${t(`${place.key}Description`)}</p>
        <p class="stay">${t('discoverStay').replace('{0}', place.stay)}</p>
        <a class="guide" href="${place.guide}" target="_blank" rel="noopener noreferrer" aria-labelledby="${place.id}-guide ${place.id}-name">
          <span id="${place.id}-guide" data-i18n="${place.guideKorean ? 'discoverGuideKorean' : 'discoverGuide'}"></span>
        </a>
        </details>
        <button type="button" data-place="${place.id}" aria-pressed="false" aria-labelledby="${place.id}-start ${place.id}-name">
          <span id="${place.id}-start"></span>${icons.route}
        </button>
        <button type="button" data-save="${place.id}" aria-pressed="${saved}" ${this.savingId || this.popularityStatus !== 'ready' ? 'disabled' : ''}>${t(this.savingId === place.id ? 'discoverSaving' : saved ? 'discoverUnsave' : 'discoverSave')}</button>
      </article>`;
    }).join('');
  }

  renderCrowd() {
    const panel = this.shadowRoot.querySelector('.crowd');
    panel.hidden = cities[this.cityIndex].id !== 'seoul';
    if (panel.hidden) return;
    if (!this.crowd) {
      panel.textContent = t(this.crowd === null ? 'discoverCrowdUnavailable' : 'discoverCrowdLoading');
      return;
    }
    const measuredAt = Date.parse(`${this.crowd.observedAt?.replace(' ', 'T')}+09:00`);
    const age = Date.now() - measuredAt;
    if (!Number.isFinite(age) || age > 60 * 60 * 1000 || age < -60 * 1000) {
      panel.textContent = t('discoverCrowdUnavailable');
      return;
    }
    const status = t('discoverCrowdStatus')
      .replace('{0}', t('discoverCrowdArea'))
      .replace('{1}', t({ '여유': 'discoverCrowdRelaxed', '보통': 'discoverCrowdNormal',
        '약간 붐빔': 'discoverCrowdSomewhatBusy', '붐빔': 'discoverCrowdBusy' }[this.crowd.level]))
      .replace('{2}', this.crowd.observedAt);
    panel.replaceChildren();
    const line = document.createElement('p'); line.textContent = status;
    panel.append(line);
    if (age > 20 * 60 * 1000) {
      const delayed = document.createElement('p'); delayed.textContent = t('discoverCrowdDelayed');
      panel.append(delayed);
    }
    const caveat = document.createElement('p'); caveat.textContent = t('discoverCrowdCaveat');
    const source = document.createElement('a'); source.href = this.crowd.source;
    source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = t('discoverCrowdSource');
    panel.append(caveat, source);
  }

  renderCourseStatus() {
    this.shadowRoot.getElementById('discover-course-status').textContent = this.courseStatus === 'empty'
      ? t('discoverCourseEmpty') : this.courseStatus === 'unavailable' ? t('discoverCourseUnavailable') : '';
  }

  renderPopularityStatus() {
    const status = this.shadowRoot.getElementById('discover-popularity-status');
    status.textContent = this.saveError
      ? t('discoverSaveFailed') : t(this.popularityStatus === 'ready' ? 'discoverPopularityNote'
        : this.popularityStatus === 'unavailable' ? 'discoverPopularityUnavailable' : 'discoverPopularityLoading');
    if (this.popularityStatus === 'unavailable') {
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = t('tryAgainText');
      retry.onclick = () => { this.popularityStatus = 'loading'; this.updateTexts(); void this.loadSavedSignals(); };
      status.append(retry);
    }
  }

  async loadSavedSignals() {
    const version = this.savedSignalsVersion = (this.savedSignalsVersion || 0) + 1;
    this.savedIds = [];
    this.popularityStatus = 'loading';
    this.saveError = false;
    if (this.isConnected) this.updateTexts();
    try {
      const { loadDiscoverySaves } = await import('../services/discovery-saves.js');
      const result = await loadDiscoverySaves();
      if (version !== this.savedSignalsVersion || !this.isConnected) return;
      this.popularity = result.statistics;
      this.savedIds = result.saved;
      this.popularityStatus = 'ready';
    } catch (error) {
      if (version !== this.savedSignalsVersion || !this.isConnected) return;
      console.warn('Discovery saves unavailable:', error);
      this.popularityStatus = 'unavailable';
    }
    if (this.isConnected) this.updateTexts();
  }

  async toggleSaved(placeId) {
    if (this.savingId) return;
    const { getCurrentUser } = await import('../../auth/services/firebase-auth.js');
    const userId = getCurrentUser()?.uid;
    if (!userId) { window.navigate('/login?next=%2Frecommend'); return; }
    this.savingId = placeId;
    this.saveError = false;
    this.updateTexts();
    try {
      const { setDiscoveryPlaceSaved } = await import('../services/discovery-saves.js');
      const result = await setDiscoveryPlaceSaved(placeId, !this.savedIds.includes(placeId));
      if (getCurrentUser()?.uid !== userId) return;
      this.savedIds = result.saved ? [...new Set([...this.savedIds, placeId])] : this.savedIds.filter(id => id !== placeId);
      this.popularity[placeId] = { count: result.count, updatedAt: result.updatedAt };
      this.popularityStatus = 'ready';
    } catch (error) { console.warn('Saving discovery place failed:', error); this.saveError = true; }
    finally { this.savingId = null; if (this.isConnected) this.updateTexts(); }
  }

  async watchSavedSignals() {
    const { subscribeToAuthChanges } = await import('../../auth/services/firebase-auth.js');
    if (!this.isConnected || this.unsubscribeSavedAuth) return;
    this.unsubscribeSavedAuth = subscribeToAuthChanges(() => void this.loadSavedSignals());
  }

  async loadSignals() {
    void this.loadCrowd();
    void this.watchSavedSignals();
    try {
      const { listPublicCourses } = await import('../../itinerary/services/public-course-service.js');
      const courses = await listPublicCourses();
      this.courseMentions = countCourseMentions(courses, cities);
      this.courseSampleSize = courses.length;
      this.courseStatus = courses.length ? 'ready' : 'empty';
      if (this.isConnected) { this.renderCards(); this.renderSelection(); this.renderCourseStatus(); }
    } catch (error) {
      console.warn('Public course signals unavailable:', error);
      this.courseStatus = 'unavailable';
      if (this.isConnected) this.renderCourseStatus();
    }
  }

  async loadCrowd() {
    this.lastCrowdFetch = Date.now();
    try {
      const [{ app }, { getFunctions, httpsCallable }] = await Promise.all([
        import('../../auth/services/firebase-auth.js'), import('firebase/functions')]);
      if (!app) throw new Error('Firebase app unavailable');
      const result = await httpsCallable(getFunctions(app), 'getSeoulCrowd', { timeout: 12000 })();
      this.crowd = result.data;
    } catch (error) {
      console.warn('Seoul crowd unavailable:', error);
      this.crowd = null;
    }
    if (this.isConnected) this.renderCrowd();
  }

  showCity(index) {
    if (index < 0 || index >= cities.length || index === this.cityIndex) return;
    this.cityIndex = index;
    this.placeLookupVersion++;
    this.resolvingPlaces = false;
    this.placeLookupError = '';
    this.selectedIds = [];
    this.updateTexts();
  }

  renderSelection() {
    this.shadowRoot.querySelectorAll('button[data-city]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.city === cities[this.cityIndex].id)));
    this.shadowRoot.querySelectorAll('button[data-filter]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.filter === this.filter)));
    this.shadowRoot.querySelectorAll('button[data-place]').forEach(button => {
      const selected = this.selectedIds.includes(button.dataset.place);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = this.resolvingPlaces || (!selected && this.selectedIds.length === 3);
      button.querySelector('span').textContent = t(selected ? 'discoverRequiredSelected' : 'discoverSelect');
    });
    const places = cities[this.cityIndex].places;
    this.shadowRoot.querySelector('.selected-list').innerHTML = this.selectedIds.map(id => {
      const name = t(`${places.find(place => place.id === id).key}Name`);
      return `<button type="button" data-remove="${id}" ${this.resolvingPlaces ? 'disabled' : ''} aria-label="${t('discoverRemovePlace').replace('{0}', name)}">${name} <span aria-hidden="true">×</span></button>`;
    }).join('');
    this.shadowRoot.getElementById('discover-selection').textContent = this.resolvingPlaces ? t('recommendationPending') : this.placeLookupError || (this.selectedIds.length
      ? t('discoverSelectedCount').replace('{0}', String(this.selectedIds.length))
      : t('discoverSelectHint'));
    const button = this.shadowRoot.getElementById('discover-plan');
    button.disabled = this.resolvingPlaces || (this.hasAttribute('planner-pick') && this.selectedIds.length === 0);
    button.querySelector('span').textContent = t(this.hasAttribute('planner-pick') ? 'addDiscoveries' : this.selectedIds.length ? 'discoverPlan' : 'flowSkipPlaces');
  }

  connectedCallback() {
    this.updateTexts();
    if (this.signalsLoaded) void this.watchSavedSignals();
    this.crowdTimer = setInterval(() => {
      if (document.hidden) return;
      this.renderCrowd();
      if (Date.now() - this.lastCrowdFetch >= 5 * 60 * 1000) void this.loadCrowd();
    }, 60 * 1000);
    window.addEventListener('i18n-changed', this.updateTexts);
    if (!this.signalsLoaded) {
      this.signalsLoaded = true;
      if ('IntersectionObserver' in window) {
        this.observer = new IntersectionObserver(entries => {
          if (entries[0]?.isIntersecting) { this.observer.disconnect(); void this.loadSignals(); }
        }, { rootMargin: '400px' });
        this.observer.observe(this);
      } else void this.loadSignals();
    }
  }

  disconnectedCallback() {
    this.placeLookupVersion++;
    this.resolvingPlaces = false;
    this.unsubscribeSavedAuth?.();
    this.unsubscribeSavedAuth = null;
    this.savedSignalsVersion = (this.savedSignalsVersion || 0) + 1;
    clearInterval(this.crowdTimer);
    window.removeEventListener('i18n-changed', this.updateTexts);
    this.observer?.disconnect();
  }
}

customElements.define('home-recommendations', HomeRecommendations);
