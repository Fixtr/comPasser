import { t, getLang, applyTranslations } from '../../../utils/i18n.js';
import { icons } from '../../../ui/icons.js';
import { trackEvent } from '../../../utils/analytics.js';
import { plannerDraftStore } from '../services/planner-draft.mjs';
import { countCourseMentions } from '../services/course-mentions.mjs';

// Curated catalogue; save counts measure interest within this service, not visits.
// Addresses and guides checked against official Visit Seoul, VISITKOREA and Visit Jeju pages, 2026-10-04.
export const cities = [
  { id: 'seoul', key: 'discoverSeoul', pair: ['palace', 'seochon'], pairReason: 'discoverSeoulPairReason', places: [
    { id: 'palace', key: 'discoverPalace', kind: 'discoverLandmark', stay: '60–120', guide: 'https://english.visitseoul.net/PalaceArea/Gyeongbokgung/ENP000072' },
    { id: 'forest', key: 'discoverForest', kind: 'discoverWalk', stay: '60–90', guide: 'https://english.visitseoul.net/nature/Seoul%20Forest/ENP001838' },
    { id: 'island', key: 'discoverIsland', kind: 'discoverFind', stay: '45–90', guide: 'https://english.visitseoul.net/attractions/SeonyudoPark/ENP000378' },
    { id: 'seochon', key: 'discoverSeochon', stay: '60–90', guide: 'https://english.visitseoul.net/attractions/SeochonHanokVillage/ENPhyd9ee', pairOnly: true },
  ] },
  { id: 'busan', key: 'discoverBusan', pair: ['haeundae', 'dongbaek'], pairReason: 'discoverBusanPairReason', places: [
    { id: 'haeundae', key: 'discoverHaeundae', kind: 'discoverLandmark', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=111053' },
    { id: 'dongbaek', key: 'discoverDongbaek', kind: 'discoverFind', stay: '45–90', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=81541' },
    { id: 'gwangalli', key: 'discoverGwangalli', kind: 'discoverWalk', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=219&vcontsId=228475' },
  ] },
  { id: 'jeju', key: 'discoverJeju', pair: ['yongduam', 'dongmun'], pairReason: 'discoverJejuPairReason', places: [
    { id: 'yongduam', key: 'discoverYongduam', kind: 'discoverLandmark', stay: '20–40', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500469' },
    { id: 'dongmun', key: 'discoverDongmun', kind: 'discoverFind', stay: '45–75', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500745' },
    { id: 'iho', key: 'discoverIho', kind: 'discoverWalk', stay: '30–60', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CNTS_200000000007344' },
  ] },
  { id: 'incheon', key: 'discoverIncheon', pair: ['chinatown', 'jayu'], pairReason: 'discoverIncheonPairReason', places: [
    { id: 'chinatown', key: 'discoverChinatown', kind: 'discoverLandmark', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=105442' },
    { id: 'jayu', key: 'discoverJayu', kind: 'discoverWalk', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=105439' },
    { id: 'songdo', key: 'discoverSongdo', kind: 'discoverFind', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=61406' },
  ] },
  { id: 'daegu', key: 'discoverDaegu', pair: ['seomun', 'gyesan'], pairReason: 'discoverDaeguPairReason', places: [
    { id: 'seomun', key: 'discoverSeomun', kind: 'discoverLandmark', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=87243' },
    { id: 'gyesan', key: 'discoverGyesan', kind: 'discoverFind', stay: '20–40', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=88338' },
    { id: 'dongseongro', key: 'discoverDongseongro', kind: 'discoverWalk', stay: '45–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=57224' },
  ] },
  { id: 'daejeon', key: 'discoverDaejeon', pair: ['hanbat', 'expo'], pairReason: 'discoverDaejeonPairReason', places: [
    { id: 'hanbat', key: 'discoverHanbat', kind: 'discoverWalk', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=82059' },
    { id: 'expo', key: 'discoverExpo', kind: 'discoverLandmark', stay: '45–75', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=95423' },
    { id: 'yuseong', key: 'discoverYuseong', kind: 'discoverFind', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=139940' },
  ] },
];
const ROTATION_MS = 12000;
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
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.selectedIds = [];
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
      this.renderPair();
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
        * { box-sizing: border-box; }
        section { padding-top: 40px; }
        .eyebrow { margin: 0 0 10px; font: 600 12px/1.5 var(--cp-mono); letter-spacing: .08em; color: var(--cp-muted); }
        h2 { margin: 0; font-size: clamp(1.4rem, 4vw, 1.8rem); line-height: 1.3; letter-spacing: -.035em; }
        .intro { margin: 12px 0 24px; max-width: 42rem; color: var(--cp-ink-2); font-size: 15px; line-height: 1.65; }
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 14px; }
        article { display: flex; flex-direction: column; min-width: 0; padding: 24px; border: 1px solid var(--cp-rule); background: var(--cp-surface); }
        .photo { margin: -24px -24px 20px; }
        .photo img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; background: var(--cp-rule); }
        .photo figcaption { padding: 6px 24px 0; color: var(--cp-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
        .photo a { color: inherit; text-underline-offset: 2px; }
        .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
        .number { font: 12px var(--cp-mono); color: var(--cp-muted); }
        .tag { margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: var(--cp-ink-2); }
        .evidence { margin: 0 0 12px; color: var(--cp-ink-2); font-size: 12px; line-height: 1.5; }
        .provenance { margin: -5px 0 16px; color: var(--cp-muted); font-size: 12px; line-height: 1.5; }
        .provenance + .provenance { margin-top: 0; }
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
        .selection { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 18px; }
        .selection p { flex: 1; min-width: 180px; margin: 0; color: var(--cp-ink-2); font-size: 14px; }
        .selection button { width: auto; min-width: 160px; justify-content: center; }
        .cities { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 22px; }
        .cities button { width: auto; min-width: 88px; justify-content: center; }
        .rotation-hint { margin: -10px 0 18px; color: var(--cp-muted); font-size: 12px; }
        .filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
        .filters button { width: auto; min-width: 0; min-height: 44px; padding: 8px 12px; border-color: var(--cp-rule); background: var(--cp-surface); color: var(--cp-ink); }
        .filters button[aria-pressed="true"] { border-color: var(--cp-ink); background: var(--cp-ink); color: var(--cp-surface); box-shadow: none; }
        .cards.is-filtered { grid-template-columns: minmax(0, 360px); }
        button[data-save] { margin-top: 8px; background: var(--cp-surface); color: var(--cp-ink); justify-content: center; }
        .selected-list { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
        .selected-list button { width: auto; min-height: 44px; padding: 8px 12px; background: var(--cp-surface); color: var(--cp-ink); }
        .guide { display: inline-flex; align-items: center; align-self: flex-start; min-height: 44px; margin-top: 8px; font-size: 12px; color: var(--cp-ink-2); text-underline-offset: 3px; }
        .pair { display: flex; flex-wrap: wrap; align-items: center; gap: 20px; margin-top: 18px; padding: 20px 24px; border: 1px solid var(--cp-rule); background: var(--cp-surface); }
        .pair-copy { flex: 1; min-width: min(100%, 240px); }
        .pair h3 { margin-bottom: 8px; font-size: 19px; }
        .pair p { margin: 0; color: var(--cp-ink-2); font-size: 13px; line-height: 1.6; }
        .pair .pair-label { margin-bottom: 8px; color: var(--cp-muted); font: 600 11px/1.5 var(--cp-mono); letter-spacing: .05em; }
        .pair button { width: auto; min-width: 180px; justify-content: center; }
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
        <div class="filters" role="group" data-i18n-aria="discoverFiltersLabel">
          ${[['all', 'discoverFilterAll'], ['popular', 'discoverFilterPopular'], ['discoverLandmark', 'discoverLandmark'], ['discoverFind', 'discoverFind'], ['discoverWalk', 'discoverWalk']]
            .map(([filter, key]) => `<button type="button" data-filter="${filter}" data-i18n="${key}" aria-pressed="false"></button>`).join('')}
        </div>
        <p class="provenance" data-i18n="discoverEditorialNote"></p>
        <p class="provenance" id="discover-course-status" role="status"></p>
        <p class="provenance" id="discover-popularity-status" role="status"></p>
        <div class="crowd" role="status" aria-live="polite"></div>
        <div class="cards"></div>
        <div class="pair"></div>
        <div class="selection">
          <div class="selected-list" data-i18n-aria="discoverSelectedPlacesLabel"></div>
          <p id="discover-selection" role="status" aria-live="polite"></p>
          <button type="button" id="discover-plan" disabled><span data-i18n="discoverPlan"></span>${icons.route}</button>
        </div>
      </section>`;
    this.shadowRoot.addEventListener('click', event => {
      const saveButton = event.target.closest('button[data-save]');
      if (saveButton) { void this.toggleSaved(saveButton.dataset.save); return; }
      const cityButton = event.target.closest('button[data-city]');
      if (cityButton) {
        this.showCity(cities.findIndex(city => city.id === cityButton.dataset.city));
        this.startRotation();
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
      if (event.target.closest('#discover-pair')) {
        const pair = cities[this.cityIndex].pair;
        this.selectedIds = pair.every(id => this.selectedIds.includes(id))
          ? this.selectedIds.filter(id => !pair.includes(id))
          : [...new Set([...this.selectedIds, ...pair])];
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
        const [pairFirst, pairSecond] = cities[this.cityIndex].pair;
        if (selected && place.id === pairFirst && places.find(item => item.id === pairSecond)?.pairOnly) {
          this.selectedIds = this.selectedIds.filter(id => id !== pairSecond);
        }
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
            anchorSchedules.push({ day: 1, name, location, time: '', endTime: '',
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
        <figure class="photo">
          <img src="/discovery/${place.id}.jpg" alt="" loading="lazy" width="960" height="600">
          <figcaption><a href="https://commons.wikimedia.org/wiki/${encodeURIComponent(photo.file)}" target="_blank" rel="noopener noreferrer">${t('discoverPhotoCredit').replace('{0}', photo.author)}</a> · <a href="${photoLicenses[photo.license]}" target="_blank" rel="noopener noreferrer">${photo.license}</a></figcaption>
        </figure>
        <div class="top"><p class="kind">${t(place.kind)}</p><span class="number" aria-hidden="true">0${index + 1} / ${city.id.toUpperCase()}</span></div>
        <p class="tag" data-i18n="${place.key}Tag"></p>
        <h3 id="${place.id}-name" data-i18n="${place.key}Name"></h3>
        <p class="area" data-i18n="${place.key}Area"></p>
        ${this.popularityStatus === 'ready' ? `<p class="evidence">${t('discoverSavedCount').replace('{0}', statistic?.count || 0)}${updated ? ` · ${t('discoverSavedUpdated').replace('{0}', updated)}` : ''}</p>` : ''}
        ${this.courseMentions[place.id] ? `<p class="evidence">${t('discoverCourseMentions').replace('{0}', this.courseMentions[place.id]).replace('{1}', this.courseSampleSize)}</p>` : ''}
        <p class="description"><strong>${t('discoverReason')} · </strong>${t(`${place.key}Description`)}</p>
        <p class="stay">${t('discoverStay').replace('{0}', place.stay)}</p>
        <button type="button" data-place="${place.id}" aria-pressed="false" aria-labelledby="${place.id}-start ${place.id}-name">
          <span id="${place.id}-start"></span>${icons.route}
        </button>
        <button type="button" data-save="${place.id}" aria-pressed="${saved}" ${this.savingId || this.popularityStatus !== 'ready' ? 'disabled' : ''}>${t(this.savingId === place.id ? 'discoverSaving' : saved ? 'discoverUnsave' : 'discoverSave')}</button>
        <a class="guide" href="${place.guide}" target="_blank" rel="noopener noreferrer" aria-labelledby="${place.id}-guide ${place.id}-name">
          <span id="${place.id}-guide" data-i18n="discoverGuide"></span>
        </a>
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
    try {
      const { loadDiscoverySaves } = await import('../services/discovery-saves.js');
      const result = await loadDiscoverySaves();
      this.popularity = result.statistics;
      this.savedIds = result.saved;
      this.popularityStatus = 'ready';
    } catch (error) {
      console.warn('Discovery saves unavailable:', error);
      this.popularityStatus = 'unavailable';
    }
    if (this.isConnected) this.updateTexts();
  }

  async toggleSaved(placeId) {
    if (this.savingId) return;
    const { getCurrentUser } = await import('../../auth/services/firebase-auth.js');
    const userId = getCurrentUser()?.uid;
    if (!userId) { window.navigate('/login?next=%2Fhome'); return; }
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

  async loadSignals() {
    void this.loadCrowd();
    void this.loadSavedSignals();
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

  renderPair() {
    const city = cities[this.cityIndex];
    const [first, second] = city.pair.map(id => city.places.find(place => place.id === id));
    this.shadowRoot.querySelector('.pair').innerHTML = `
      <div class="pair-copy">
        <p class="pair-label">${t('discoverPairLabel')}</p>
        <h3>${t(`${first.key}Name`)} + ${t(`${second.key}Name`)}</h3>
        <p>${t(city.pairReason)}</p>
        <a class="guide" href="${second.guide}" target="_blank" rel="noopener noreferrer">${t('discoverGuide')}</a>
      </div>
      <button type="button" id="discover-pair" aria-pressed="false"></button>`;
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
      if (!document.hidden && this.getClientRects().length && !this.matches(':hover, :focus-within') && !this.selectedIds.length && this.filter === 'all') {
        this.showCity((this.cityIndex + 1) % cities.length);
      }
    }, ROTATION_MS);
  }

  renderSelection() {
    this.shadowRoot.querySelectorAll('button[data-city]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.city === cities[this.cityIndex].id)));
    this.shadowRoot.querySelectorAll('button[data-filter]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.filter === this.filter)));
    this.shadowRoot.querySelectorAll('button[data-place]').forEach(button => {
      const selected = this.selectedIds.includes(button.dataset.place);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = !selected && this.selectedIds.length === 3;
      button.querySelector('span').textContent = t(selected ? 'discoverRequiredSelected' : 'discoverSelect');
    });
    const pair = cities[this.cityIndex].pair;
    const pairSelected = pair.every(id => this.selectedIds.includes(id));
    const pairButton = this.shadowRoot.getElementById('discover-pair');
    pairButton.setAttribute('aria-pressed', String(pairSelected));
    pairButton.disabled = !pairSelected && new Set([...this.selectedIds, ...pair]).size > 3;
    pairButton.textContent = t(pairSelected ? 'discoverPairRemove' : 'discoverPairSelect');
    const places = cities[this.cityIndex].places;
    this.shadowRoot.querySelector('.selected-list').innerHTML = this.selectedIds.map(id => {
      const name = t(`${places.find(place => place.id === id).key}Name`);
      return `<button type="button" data-remove="${id}" aria-label="${t('discoverRemovePlace').replace('{0}', name)}">${name} <span aria-hidden="true">×</span></button>`;
    }).join('');
    this.shadowRoot.getElementById('discover-selection').textContent = this.selectedIds.length
      ? t('discoverSelectedCount').replace('{0}', String(this.selectedIds.length))
      : t('discoverSelectHint');
    this.shadowRoot.getElementById('discover-plan').disabled = this.selectedIds.length === 0;
  }

  connectedCallback() {
    this.updateTexts();
    this.startRotation();
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
    clearInterval(this.rotationTimer);
    clearInterval(this.crowdTimer);
    window.removeEventListener('i18n-changed', this.updateTexts);
    this.observer?.disconnect();
  }
}

customElements.define('home-recommendations', HomeRecommendations);
