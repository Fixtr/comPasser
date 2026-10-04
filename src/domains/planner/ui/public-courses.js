import { listPublicCourses } from '../../itinerary/services/public-course-service.js';
import { plannerDraftStore } from '../services/planner-draft.mjs';
import { t } from '../../../utils/i18n.js';
import { trackEvent } from '../../../utils/analytics.js';

class PublicCourses extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.courses = [];
    this.render = this.render.bind(this);
  }

  connectedCallback() {
    this.render();
    window.addEventListener('i18n-changed', this.render);
    this.shadowRoot.addEventListener('click', event => {
      const button = event.target.closest('button[data-course]');
      if (!button) return;
      const course = this.courses.find(item => item.id === button.dataset.course);
      if (!course) return;
      const draft = plannerDraftStore.read();
      const anchors = [...draft.anchorSchedules];
      for (const stop of course.stops) {
        if (!anchors.some(item => item.name === stop.name && item.location === stop.location)) {
          anchors.push({ day: 1, name: stop.name, location: stop.location, time: '', endTime: '',
            flexible: true, stayMinutes: stop.stayMinutes });
        }
      }
      plannerDraftStore.save({ ...draft, anchorSchedules: anchors, selectedWaypoints: [] });
      trackEvent('public_course_copy', { courseId: course.id });
      window.navigate('/login?next=%2Fpreference%2F1');
    });
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(entries => {
        if (!entries[0]?.isIntersecting) return;
        this.observer.disconnect();
        void this.load();
      }, { rootMargin: '400px' });
      this.observer.observe(this);
    } else void this.load();
  }

  disconnectedCallback() { window.removeEventListener('i18n-changed', this.render); this.observer?.disconnect(); }

  async load() {
    try { this.courses = await listPublicCourses(); this.error = false; }
    catch (error) { console.error('Public courses unavailable:', error); this.error = true; }
    this.loaded = true;
    if (this.isConnected) this.render();
  }

  render() {
    const root = this.shadowRoot;
    root.replaceChildren();
    const style = document.createElement('style');
    style.textContent = `
      :host { display:block; width:100%; padding:24px 0 48px; color:var(--cp-ink); font-family:var(--cp-font); }
      h2 { margin:0 0 8px; font-size:clamp(1.4rem,4vw,1.8rem); }
      p { color:var(--cp-ink-2); line-height:1.6; }
      .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); gap:14px; }
      article { border:1px solid var(--cp-rule); background:var(--cp-surface); padding:24px; min-width:0; }
      h3 { margin:8px 0; font-size:1.15rem; overflow-wrap:anywhere; }
      .stops, .review { overflow-wrap:anywhere; }
      button { min-height:44px; padding:10px 14px; border:1px solid var(--cp-ink); background:var(--cp-ink); color:var(--cp-paper); cursor:pointer; font:inherit; font-weight:700; }
      button:focus-visible { outline:3px solid var(--cp-ink); outline-offset:3px; }
    `;
    const heading = document.createElement('h2'); heading.textContent = t('publicCoursesTitle');
    const intro = document.createElement('p'); intro.textContent = t('publicCoursesIntro');
    root.append(style, heading, intro);
    if (this.error || !this.courses.length) {
      const message = document.createElement('p');
      message.textContent = t(this.error ? 'publicCoursesError' : this.loaded ? 'publicCoursesEmpty' : 'publicCourseLoading');
      root.append(message);
      return;
    }
    const cards = document.createElement('div'); cards.className = 'cards';
    for (const course of this.courses) {
      const article = document.createElement('article');
      const label = document.createElement('span'); label.textContent = t('publicCoursesLabel');
      const title = document.createElement('h3'); title.textContent = course.title;
      const stops = document.createElement('p'); stops.className = 'stops';
      stops.textContent = course.stops.map(stop => stop.name).join(' → ');
      const review = document.createElement('p'); review.className = 'review'; review.textContent = course.review || '';
      const action = document.createElement('button'); action.type = 'button';
      action.dataset.course = course.id; action.textContent = t('courseCopyButton');
      article.append(label, title, stops, review, action);
      cards.append(article);
    }
    root.append(cards);
  }
}

customElements.define('public-courses', PublicCourses);
