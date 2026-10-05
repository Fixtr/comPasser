import { cities } from './home-recommendations.js';
import { plannerDraftStore } from '../services/planner-draft.mjs';
import { t } from '../../../utils/i18n.js';
import { trackEvent } from '../../../utils/analytics.js';
import { getPublicRouteUrl } from '../../itinerary/services/share-links.js';

class HomeCourses extends HTMLElement {
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
      const anchors = [...draft.anchorSchedules];
      for (const id of city.pair) {
        const place = city.places.find(item => item.id === id);
        const name = t(`${place.key}Name`), location = t(`${place.key}Location`);
        if (!anchors.some(item => item.name === name && item.location === location)) {
          anchors.push({ day: 1, name, location, time: '', endTime: '',
            flexible: true, stayMinutes: Number.parseInt(place.stay, 10) });
        }
      }
      plannerDraftStore.save({ ...draft, anchorSchedules: anchors, selectedWaypoints: [] });
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
      :host { display:block; width:100%; padding:40px 0; color:var(--cp-ink); font-family:var(--cp-font); }
      h2 { margin:0 0 8px; font-size:clamp(1.4rem,4vw,1.8rem); }
      p { color:var(--cp-ink-2); line-height:1.6; }
      .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); gap:14px; }
      article { border:1px solid var(--cp-rule); background:var(--cp-surface); padding:24px; }
      h3 { margin:8px 0; font-size:1.15rem; }
      button { min-height:44px; padding:10px 14px; border:1px solid var(--cp-ink); background:var(--cp-ink); color:var(--cp-paper); cursor:pointer; font:inherit; font-weight:700; }
      button:focus-visible { outline:3px solid var(--cp-ink); outline-offset:3px; }
    `;
    const heading = document.createElement('h2');
    heading.textContent = t('courseBrowseTitle');
    const intro = document.createElement('p');
    intro.textContent = t('courseBrowseIntro');
    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const city of cities) {
      const places = city.pair.map(id => city.places.find(place => place.id === id));
      const article = document.createElement('article');
      const label = document.createElement('span');
      label.textContent = `${t('courseCuratedLabel')} · ${t(city.key)}`;
      const title = document.createElement('h3');
      title.textContent = places.map(place => t(`${place.key}Name`)).join(' + ');
      const reason = document.createElement('p');
      reason.textContent = t(city.pairReason);
      const action = document.createElement('button');
      action.type = 'button';
      action.dataset.city = city.id;
      action.textContent = t('courseCopyButton');
      article.append(label, title, reason, action);
      const englishPage = document.createElement('a'); englishPage.href = getPublicRouteUrl(`curated-${city.id}`);
      englishPage.textContent = t('publicRoutePageLink'); englishPage.style.display = 'block';
      article.append(englishPage);
      cards.append(article);
    }
    root.append(style, heading, intro, cards);
  }
}

customElements.define('home-courses', HomeCourses);
