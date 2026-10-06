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
        h2 { margin: 0 0 20px; font-size: clamp(1.4rem, 4vw, 1.8rem); line-height: 1.3; letter-spacing: -.035em; }
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 14px; }
        article { display: flex; flex-direction: column; min-width: 0; padding: 20px; border: 1px solid var(--cp-rule); background: var(--cp-surface); }
        .photo { margin: -20px -20px 16px; }
        .photo img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; background: var(--cp-rule); }
        .photo figcaption { padding: 6px 20px 0; color: var(--cp-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
        .photo a { color: inherit; text-underline-offset: 2px; }
        h3 { margin: 0 0 4px; font-size: 18px; line-height: 1.3; letter-spacing: -.02em; overflow-wrap: anywhere; }
        .area { margin: 0 0 8px; font-size: 12px; line-height: 1.5; color: var(--cp-muted); }
        .more-row { display: flex; justify-content: flex-end; margin-top: 14px; margin-bottom: 32px; }
        .more-link { display: inline-flex; align-items: center; font-weight: 600; font-size: 14px; color: var(--cp-ink); text-decoration: none; border-bottom: 1px solid var(--cp-ink); padding-bottom: 2px; }
        .more-link:hover { opacity: .7; }
        .divider { border: 0; border-top: 1px solid var(--cp-rule); margin: 0 0 28px; }
        .courses-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
        .strip-label { font: 600 12px var(--cp-mono); color: var(--cp-muted); margin-right: 4px; }
        .course-chip { padding: 6px 12px; border: 1px solid var(--cp-rule); background: var(--cp-surface); font-size: 13px; color: var(--cp-ink); text-decoration: none; }
        .course-chip:hover { border-color: var(--cp-ink); }
      </style>
      <section aria-labelledby="preview-title">
        <p class="eyebrow" data-i18n="discoverEyebrow"></p>
        <h2 id="preview-title" data-i18n="homePreviewTitle"></h2>
        <div class="cards">
          ${previewPlaces.map(place => {
            const photo = photos[place.id] || { file: '', author: '', license: 'CC0 1.0' };
            return `
            <article>
              <figure class="photo">
                <img src="/discovery/${place.id}.jpg" alt="" loading="lazy" width="960" height="600">
                <figcaption><a href="https://commons.wikimedia.org/wiki/${encodeURIComponent(photo.file)}" target="_blank" rel="noopener noreferrer">${t('discoverPhotoCredit').replace('{0}', photo.author)}</a> · <a href="${photoLicenses[photo.license]}" target="_blank" rel="noopener noreferrer">${photo.license}</a></figcaption>
              </figure>
              <h3 data-i18n="${place.key}Name"></h3>
              <p class="area" data-i18n="${place.key}Area"></p>
            </article>`;
          }).join('')}
        </div>
        <div class="more-row">
          <a class="more-link" href="/recommend" data-nav data-i18n="homePreviewMore"></a>
        </div>
        <hr class="divider">
        <div class="courses-strip">
          <span class="strip-label" data-i18n="homeCoursesTitle"></span>
          ${curatedPairs.map(city => {
            const places = city.pair.map(id => city.places.find(p => p.id === id)).filter(Boolean);
            const title = places.map(p => t(`${p.key}Name`)).join(' + ');
            return `<a class="course-chip" href="/courses" data-nav>${title}</a>`;
          }).join('')}
          <a class="more-link" href="/courses" data-nav data-i18n="homeCoursesMore"></a>
        </div>
      </section>
    `;
    applyTranslations(this.shadowRoot);
  }
}

customElements.define('home-preview', HomePreview);
