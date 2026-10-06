import { t, applyTranslations } from '../../../utils/i18n.js';
import { cities } from '../services/discovery-catalogue.mjs';

const photoLicenses = {
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
  'CC BY-SA 2.0': 'https://creativecommons.org/licenses/by-sa/2.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
};

const photos = {
  palace: { file: 'File:Front view of the Imperial Throne Hall Geunjeongjeon at Gyeongbokgung Palace with blue sky in Seoul.jpg', author: 'Basile Morin', license: 'CC BY-SA 4.0' },
  forest: { file: 'File:Flowers in Seoul Forest Park.jpg', author: 'Rachel.zrq', license: 'CC0 1.0' },
  island: { file: 'File:Seonyudo Park.jpg', author: 'traveloriented', license: 'CC BY-SA 2.0' },
};

class HomePreview extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.render = this.render.bind(this);
  }

  connectedCallback() {
    this.render();
    window.addEventListener('i18n-changed', this.render);
    this.shadowRoot.addEventListener('click', event => {
      const link = event.target.closest('a[data-nav]');
      if (link && typeof window.navigate === 'function') {
        event.preventDefault();
        window.navigate(link.getAttribute('href'));
      }
    });
  }

  disconnectedCallback() {
    window.removeEventListener('i18n-changed', this.render);
  }

  render() {
    const seoul = cities[0];
    const previewPlaces = seoul.places.filter(place => !place.pairOnly).slice(0, 3);
    const curatedPairs = cities.slice(0, 3);

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; text-align: left; color: var(--cp-ink); font-family: var(--cp-font); }
        * { box-sizing: border-box; }
        section { padding-top: 40px; }
        .eyebrow { margin: 0 0 10px; font: 600 12px/1.5 var(--cp-mono); letter-spacing: .08em; color: var(--cp-muted); }
        h2 { margin: 0 0 10px; font-size: clamp(1.4rem, 4vw, 1.8rem); line-height: 1.3; letter-spacing: -.035em; }
        .intro { margin: 0 0 24px; max-width: 42rem; color: var(--cp-ink-2); font-size: 15px; line-height: 1.65; }
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 14px; }
        article { display: flex; flex-direction: column; min-width: 0; padding: 24px; border: 1px solid var(--cp-rule); background: var(--cp-surface); }
        .photo { margin: -24px -24px 20px; }
        .photo img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; background: var(--cp-rule); }
        .photo figcaption { padding: 6px 24px 0; color: var(--cp-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
        .photo a { color: inherit; text-underline-offset: 2px; }
        .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
        .number { font: 12px var(--cp-mono); color: var(--cp-muted); }
        .kind { margin: 0; padding: 4px 8px; border: 1px solid var(--cp-rule); color: var(--cp-ink-2); font: 600 11px/1.5 var(--cp-mono); }
        .tag { margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: var(--cp-ink-2); }
        h3 { margin: 0 0 6px; font-size: 23px; line-height: 1.25; letter-spacing: -.03em; overflow-wrap: anywhere; }
        .area { margin: 0 0 8px; font-size: 12px; line-height: 1.5; color: var(--cp-muted); }
        .description { flex: 1; margin: 16px 0; font-size: 14px; line-height: 1.7; color: var(--cp-ink-2); word-break: keep-all; overflow-wrap: anywhere; }
        .stay { margin: 0 0 14px; color: var(--cp-muted); font-size: 12px; line-height: 1.5; }
        .guide { display: inline-flex; align-items: center; align-self: flex-start; min-height: 36px; margin-top: 4px; font-size: 12px; color: var(--cp-ink-2); text-decoration: underline; text-underline-offset: 3px; }
        .more-row { display: flex; justify-content: flex-end; margin-top: 18px; margin-bottom: 32px; }
        .more-link { display: inline-flex; align-items: center; font-weight: 600; font-size: 14px; color: var(--cp-ink); text-decoration: none; border-bottom: 1px solid var(--cp-ink); padding-bottom: 2px; }
        .more-link:hover { opacity: .7; }
        .divider { border: 0; border-top: 1px solid var(--cp-rule); margin: 16px 0 40px; }
        .courses-preview-section { margin-top: 8px; }
        .courses-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 14px; }
        .course-card { display: flex; flex-direction: column; min-width: 0; padding: 24px; border: 1px solid var(--cp-rule); background: var(--cp-surface); }
        .course-card .kind { align-self: flex-start; margin-bottom: 12px; }
        .course-card h3 { margin: 0 0 8px; font-size: 1.15rem; line-height: 1.35; letter-spacing: -.02em; }
        .course-reason { flex: 1; margin: 0 0 20px; font-size: 13px; line-height: 1.6; color: var(--cp-ink-2); word-break: keep-all; }
        .course-action { display: inline-flex; justify-content: center; align-items: center; width: 100%; min-height: 44px; padding: 10px 14px; border: 1px solid var(--cp-ink); background: var(--cp-ink); color: var(--cp-surface); text-decoration: none; font-weight: 700; font-size: 14px; cursor: pointer; }
        .course-action:hover { background: var(--cp-surface); color: var(--cp-ink); }
        :is(button, a):focus-visible { outline: 2px solid var(--cp-ink); outline-offset: 4px; }
      </style>
      <section aria-labelledby="preview-title">
        <p class="eyebrow">${t('discoverEyebrow')} · ${t(seoul.key)}</p>
        <h2 id="preview-title" data-i18n="discoverTitle"></h2>
        <p class="intro" data-i18n="discoverDescription"></p>
        <div class="cards">
          ${previewPlaces.map((place, index) => {
            const photo = photos[place.id] || { file: '', author: '', license: 'CC0 1.0' };
            return `
            <article aria-labelledby="${place.id}-name">
              <figure class="photo">
                <img src="/discovery/${place.id}.jpg" alt="" loading="lazy" width="960" height="600">
                <figcaption><a href="https://commons.wikimedia.org/wiki/${encodeURIComponent(photo.file)}" target="_blank" rel="noopener noreferrer">${t('discoverPhotoCredit').replace('{0}', photo.author)}</a> · <a href="${photoLicenses[photo.license]}" target="_blank" rel="noopener noreferrer">${photo.license}</a></figcaption>
              </figure>
              <div class="top"><p class="kind">${t(place.kind)}</p><span class="number" aria-hidden="true">0${index + 1} / ${seoul.id.toUpperCase()}</span></div>
              <p class="tag" data-i18n="${place.key}Tag"></p>
              <h3 id="${place.id}-name" data-i18n="${place.key}Name"></h3>
              <p class="area" data-i18n="${place.key}Area"></p>
              <p class="description"><strong>${t('discoverReason')} · </strong>${t(`${place.key}Description`)}</p>
              <p class="stay">${t('discoverStay').replace('{0}', place.stay)}</p>
              <a class="guide" href="${place.guide}" target="_blank" rel="noopener noreferrer" aria-labelledby="${place.id}-guide ${place.id}-name">
                <span id="${place.id}-guide" data-i18n="discoverGuide"></span>
              </a>
            </article>`;
          }).join('')}
        </div>
        <div class="more-row">
          <a class="more-link" href="/recommend" data-nav data-i18n="homePreviewMore"></a>
        </div>
        <hr class="divider">
        <div class="courses-preview-section">
          <p class="eyebrow" data-i18n="courseCuratedLabel"></p>
          <h2 data-i18n="courseBrowseTitle"></h2>
          <p class="intro" data-i18n="courseBrowseIntro"></p>
          <div class="courses-grid">
            ${curatedPairs.map(city => {
              const places = city.pair.map(id => city.places.find(p => p.id === id)).filter(Boolean);
              const title = places.map(p => t(`${p.key}Name`)).join(' + ');
              return `
                <div class="course-card">
                  <span class="kind">${t('courseCuratedLabel')} · ${t(city.key)}</span>
                  <h3>${title}</h3>
                  <p class="course-reason">${t(city.pairReason)}</p>
                  <a class="course-action" href="/courses" data-nav>${t('courseCopyButton')}</a>
                </div>
              `;
            }).join('')}
          </div>
          <div class="more-row">
            <a class="more-link" href="/courses" data-nav data-i18n="homeCoursesMore"></a>
          </div>
        </div>
      </section>
    `;
    applyTranslations(this.shadowRoot);
  }
}

customElements.define('home-preview', HomePreview);
