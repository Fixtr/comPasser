import { courseCities as cities, curatedRoute } from '../../itinerary/services/public-route.mjs';
import { addCourseToDraft } from '../services/course-draft.mjs';
import { plannerDraftStore } from '../services/planner-draft.mjs';
import { t, getLang } from '../../../utils/i18n.js';
import { trackEvent } from '../../../utils/analytics.js';
import { getPublicRouteUrl } from '../../itinerary/services/share-links.js';

class HomeCourses extends HTMLElement {
  static get observedAttributes() { return ['city']; }
  attributeChangedCallback() { if (this.isConnected) this.render(); }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.render = this.render.bind(this);
  }

  connectedCallback() {
    this.render();
    window.addEventListener('i18n-changed', this.render);
    this.shadowRoot.addEventListener('click', event => {
      const button = event.target.closest('button[data-city]');
      if (!button) return;
      const city = cities.find(item => item.id === button.dataset.city);
      if (!city) return;
      const draft = plannerDraftStore.read();
      const route = curatedRoute(button.dataset.course);
      if (!route) return;
      plannerDraftStore.save(addCourseToDraft(draft, route, getLang()));
      trackEvent('curated_course_copy', { city: city.id });
      window.navigate('/login?next=%2Fpreference%2F1');
    });
  }

  disconnectedCallback() { window.removeEventListener('i18n-changed', this.render); }

  render() {
    const root = this.shadowRoot;
    root.replaceChildren();
    const style = document.createElement('style');
    style.textContent = `
      :host { display:block; width:100%; padding:24px 0; color:var(--cp-ink); font-family:var(--cp-font); }
      h2 { margin:0 0 16px; font-size:clamp(1.4rem,4vw,1.8rem); }
      .cards { display:grid; grid-template-columns:repeat(3,minmax(0,280px)); gap:12px; }
      article { display:flex; flex-direction:column; border:1px solid var(--cp-rule); background:var(--cp-surface); padding:10px; min-width:0; overflow-wrap:anywhere; }
      article a { font-size:12px; margin-top:6px; }
      h3 { flex:1; margin:0 0 8px; font-size:1rem; }
      button { min-height:44px; padding:8px; border:1px solid var(--cp-ink); background:var(--cp-ink); color:var(--cp-paper); cursor:pointer; font:inherit; font-size:13px; font-weight:700; }
      @media (max-width:600px) { .cards { gap:8px; } article { padding:8px; } h3 { font-size:13px; } button { font-size:12px; } }
      /* Three 110px columns broke Korean names mid-syllable ('서촌 한/옥마을'); phones stack the cards. */
      @media (max-width:520px) { .cards { grid-template-columns:minmax(0,1fr); } }
      h3, button, a { word-break:keep-all; }
      button:focus-visible { outline:3px solid var(--cp-ink); outline-offset:3px; }
    `;
    const heading = document.createElement('h2');
    heading.textContent = t(this.hasAttribute('city') ? 'courseCuratedLabel' : 'courseBrowseTitle');
    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const city of cities.filter(city => this.hasAttribute('city') ? city.id === this.getAttribute('city') : !city.country)) {
     for (const suffix of ['', '-2', '-3']) {
      const route = curatedRoute(`curated-${city.id}${suffix}`);
      const article = document.createElement('article');
      const title = document.createElement('h3');
      title.textContent = route.stops.map(place => getLang() === 'en' ? place.englishName || place.name : place.name).join(' → ');
      const action = document.createElement('button');
      action.type = 'button';
      action.dataset.city = city.id;
      action.dataset.course = route.id;
      action.textContent = t('courseCopyButton');
      article.append(title, action);
      const englishPage = document.createElement('a'); englishPage.href = getPublicRouteUrl(route.id);
      englishPage.textContent = t('courseEnglishLink'); englishPage.style.display = 'block';
      article.append(englishPage);
      cards.append(article);
     }
    }
    root.append(style, heading, cards);
  }
}

customElements.define('home-courses', HomeCourses);
