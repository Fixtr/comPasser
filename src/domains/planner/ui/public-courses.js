import { listPublicCourses, getPublicCourse } from '../../itinerary/services/public-course-service.js';
import { plannerDraftStore } from '../services/planner-draft.mjs';
import { t } from '../../../utils/i18n.js';
import { trackEvent } from '../../../utils/analytics.js';
import { getCurrentUser } from '../../auth/services/firebase-auth.js';
import { COURSE_CITIES, filterCourses } from '../../itinerary/services/course-community.mjs';
import { getPublicRouteUrl } from '../../itinerary/services/share-links.js';
import { addCourseToDraft, cityDestination } from '../services/course-draft.mjs';
import { destinations } from '../services/travel-destinations.mjs';

// The list is global (each city filters it here), so the last one loaded can stand in for any
// city while a load fails, e.g. offline after picking another city.
let lastLoaded = null;

class PublicCourses extends HTMLElement {
  static get observedAttributes() { return ['city']; }
  attributeChangedCallback() {
    this.filters.city = this.getAttribute('city') || '';
    if (this.isConnected) this.render();
  }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.courses = [];
    this.filters = { search: '', city: '', duration: '' };
    this.render = this.render.bind(this);
    // Only a load that failed offline retries by itself, the same kind (page 1 or load-more) that failed.
    // The reload re-renders every card, so the review panel the user had open is opened again.
    this.reloadWhenOnline = () => {
      if (!this.error || !this.offline) return;
      this.keepOpenId = this.shadowRoot.querySelector('article.reviewing button[data-course]')?.dataset.course || null;
      void this.load(this.failedMore);
    };
  }

  connectedCallback() {
    const requestedReview = new URLSearchParams(window.location.search).get('review');
    this.openReviewId = /^[a-zA-Z0-9]+$/.test(requestedReview || '') ? requestedReview : null;
    this.render();
    window.addEventListener('i18n-changed', this.render);
    window.addEventListener('online', this.reloadWhenOnline);
    this.shadowRoot.addEventListener('click', event => {
      const button = event.target.closest('button[data-course]');
      if (!button) return;
      const course = this.courses.find(item => item.id === button.dataset.course);
      if (!course) return;
      // Traveler courses store no city; the city this list shows is theirs.
      const city = destinations.find(item => item.id === (this.getAttribute('city') || this.filters.city));
      plannerDraftStore.save(addCourseToDraft(plannerDraftStore.read(), city ? { ...course, destination: cityDestination(city) } : course));
      trackEvent('public_course_copy', { courseId: course.id });
      window.navigate('/login?next=%2Fpreference%2F1');
    });
    if (this.openReviewId) void this.load();
    else if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(entries => {
        if (!entries[0]?.isIntersecting) return;
        this.observer.disconnect();
        void this.load();
      }, { rootMargin: '400px' });
      this.observer.observe(this);
    } else void this.load();
  }

  disconnectedCallback() { window.removeEventListener('i18n-changed', this.render); window.removeEventListener('online', this.reloadWhenOnline); this.observer?.disconnect(); }

  async load(more = false) {
    if (this.loading) return;
    this.loading = true;
    try {
      const result = await listPublicCourses(more ? this.cursor : null);
      this.courses = more ? [...this.courses, ...result.courses.filter(course => !this.courses.some(saved => saved.id === course.id))] : result.courses;
      if (this.openReviewId && !this.courses.some(course => course.id === this.openReviewId)) {
        const requested = await getPublicCourse(this.openReviewId);
        if (requested) this.courses.unshift({ id: this.openReviewId, ...requested });
      }
      this.cursor = result.cursor; this.hasMore = result.hasMore; this.error = false;
      if (!more) lastLoaded = this.courses;
    }
    catch (error) {
      console.error('Public courses unavailable:', error);
      this.error = true;
      this.offline = navigator.onLine === false;
      this.failedMore = more;
      if (!this.courses.length && lastLoaded) { this.courses = lastLoaded; this.hasMore = false; }
    }
    this.loading = false;
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
      .cards { display:grid; grid-template-columns:repeat(3,minmax(0,280px)); gap:12px; }
      /* The list is never wider than 700px, so a card with its reviews open takes the whole row at any screen size. */
      .cards article.reviewing { grid-column:1 / -1; }
      @media (max-width:600px) { .cards { grid-template-columns:1fr; gap:10px; } .cards article { padding:12px; overflow-wrap:anywhere; } }
      article { display:flex; flex-direction:column; border:1px solid var(--cp-rule); background:var(--cp-surface); padding:14px; min-width:0; overflow-wrap:anywhere; }
      article > button { display:block; box-sizing:border-box; width:100%; min-width:0; padding:8px; white-space:normal; overflow-wrap:anywhere; font-size:13px; }
      article > button[data-course] { margin-top:auto; }
      article > button + button { margin-top:8px; }
      article > a { display:flex; align-items:center; min-height:44px; margin-top:2px; font-size:12px; color:var(--cp-ink); text-underline-offset:3px; }
      h3 { margin:8px 0; font-size:1.15rem; overflow-wrap:anywhere; }
      .stops, .review { overflow-wrap:anywhere; }
      button { min-height:44px; padding:10px 14px; border:1px solid var(--cp-ink); background:var(--cp-ink); color:var(--cp-paper); cursor:pointer; font:inherit; font-weight:700; }
      button:focus-visible { outline:3px solid var(--cp-ink); outline-offset:3px; }
      .filters { display:flex; flex-wrap:wrap; gap:10px; margin:16px 0; }
      label { display:grid; gap:6px; flex:1 1 150px; }
      input,select { width:100%; box-sizing:border-box; min-height:44px; padding:10px; font:inherit; color:var(--cp-ink); background:var(--cp-surface); border:1px solid var(--cp-rule); }
      .more { margin-top:16px; }
      .result-status { margin:0 0 12px; word-break:keep-all; }
      .result-status + button { margin:-4px 0 12px; }
    `;
    const heading = document.createElement('h2'); heading.textContent = t('publicCoursesTitle');
    const intro = document.createElement('p'); intro.textContent = t('publicCoursesIntro');
    root.append(style, heading, intro);
    if (this.error || !this.courses.length) {
      const message = document.createElement('p');
      message.textContent = t(this.error ? (this.offline ? (this.courses.length ? 'publicCoursesOfflineCached' : 'courseOffline') : 'publicCoursesError') : this.loaded ? 'publicCoursesEmpty' : 'publicCoursesLoading');
      root.append(message);
      // Offline it reloads by itself on the 'online' event, so a retry button would only fail again.
      if (this.error && !this.offline) {
        const retry = document.createElement('button'); retry.textContent = t('courseReviewsRetry');
        retry.onclick = () => void this.load(); root.append(retry);
      }
      if (this.courses.length) this.renderBrowse(root);
      if (this.loaded && !this.error) {
        const action = document.createElement('button');
        action.type = 'button'; action.textContent = t('publicCoursesShareFirst');
        action.onclick = () => window.navigate(getCurrentUser() ? '/profile/trips' : '/login?next=%2Fprofile%2Ftrips');
        root.append(action);
      }
      return;
    }
    this.renderBrowse(root);
  }

  renderBrowse(root) {
    const filters = document.createElement('div'); filters.className = 'filters';
    for (const [key, labelKey, options] of [
      ['search', 'courseSearch', null],
      ['city', 'courseCityFilter', [['', 'courseAllCities'], ...Object.keys(COURSE_CITIES).map(city => [city, destinations.find(item => item.id === city)?.key || `discover${city[0].toUpperCase()}${city.slice(1)}`])]],
      ['duration', 'courseDurationFilter', [['', 'courseAllDurations'], ['short', 'courseDurationShort'], ['half', 'courseDurationHalf'], ['long', 'courseDurationLong']]],
    ]) {
      if (key === 'city' && this.hasAttribute('city')) continue;
      const label = document.createElement('label'); label.textContent = t(labelKey);
      const control = document.createElement(options ? 'select' : 'input');
      control.name = key;
      if (options) for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = t(text); control.append(option); }
      else { control.type = 'search'; control.placeholder = t('courseSearchPlaceholder'); }
      control.value = this.filters[key];
      control.addEventListener(options ? 'change' : 'input', () => { this.filters[key] = control.value; this.renderCards(); });
      label.append(control); filters.append(label);
    }
    // Only point to 'load more' when there is a next page to load.
    const canLoadMore = this.hasMore && !(this.error && this.offline);
    const hint = document.createElement('p'); hint.textContent = canLoadMore ? `${t('courseSearchScope')} ${t('courseSearchLoadMore')}` : t('courseSearchScope');
    // Filtering changes the list in place, so a polite status says how many routes are left.
    this.status = document.createElement('p'); this.status.className = 'result-status'; this.status.setAttribute('role', 'status');
    this.reset = document.createElement('button'); this.reset.type = 'button'; this.reset.textContent = t('courseFiltersReset');
    this.reset.onclick = () => {
      this.filters = { search: '', city: this.getAttribute('city') || '', duration: '' };
      filters.querySelectorAll('input,select').forEach(control => { control.value = this.filters[control.name]; });
      this.renderCards();
      // The button hides itself once results return; keep keyboard focus on the search.
      filters.querySelector('input')?.focus();
    };
    this.cards = document.createElement('div'); this.cards.className = 'cards';
    root.append(filters, hint, this.status, this.reset, this.cards);
    this.renderCards();
    if (canLoadMore) {
      const more = document.createElement('button'); more.className = 'more'; more.textContent = t('courseLoadMore');
      more.onclick = () => { more.disabled = true; void this.load(true); }; root.append(more);
    }
  }

  renderCards() {
    this.cards.replaceChildren();
    const filtered = filterCourses(this.courses, { ...this.filters, city: this.getAttribute('city') || this.filters.city });
    this.status.textContent = filtered.length ? t('courseResultCount').replace('{0}', filtered.length) : t('courseSearchEmpty');
    // Offered only when a filter the user set is what empties the list.
    this.reset.hidden = filtered.length > 0 || (!this.filters.search && !this.filters.duration && (this.hasAttribute('city') || !this.filters.city));
    for (const course of filtered) {
      const article = document.createElement('article');
      const label = document.createElement('span'); label.textContent = t('publicCoursesLabel');
      const title = document.createElement('h3'); title.textContent = course.title;
      const stops = document.createElement('p'); stops.className = 'stops';
      stops.textContent = course.stops.map(stop => stop.name).join(' → ');
      const review = document.createElement('p'); review.className = 'review'; review.textContent = course.review || '';
      const action = document.createElement('button'); action.type = 'button';
      action.dataset.course = course.id; action.textContent = t('courseCopyButton');
      // Every card repeats the same words; the name adds the course so a list of controls tells them apart.
      const named = (control, key) => control.setAttribute('aria-label', `${t(key)}: ${course.title}`);
      named(action, 'courseCopyButton');
      const reviews = document.createElement('button'); reviews.type = 'button'; reviews.textContent = t('courseReviewsButton'); reviews.setAttribute('aria-expanded', 'false');
      named(reviews, 'courseReviewsButton');
      reviews.onclick = async () => {
        const old = article.querySelector('course-reviews');
        if (old) { old.remove(); reviews.setAttribute('aria-expanded', 'false'); article.classList.remove('reviewing'); return; }
        // aria-busy, not disabled: a disabled button drops keyboard focus to the page body.
        if (reviews.getAttribute('aria-busy') === 'true') return;
        reviews.setAttribute('aria-busy', 'true');
        try {
          await import('./course-reviews.js');
          if (!article.isConnected) return;
          const panel = document.createElement('course-reviews'); panel.course = course;
          article.append(panel); reviews.setAttribute('aria-expanded', 'true'); article.classList.add('reviewing');
        } catch { reviews.textContent = t('courseReviewsError'); named(reviews, 'courseReviewsError'); }
        finally { reviews.removeAttribute('aria-busy'); }
      };
      article.append(label, title, stops, review, action, reviews);
      const englishPage = document.createElement('a'); englishPage.href = getPublicRouteUrl(course.id);
      englishPage.textContent = t('courseEnglishLink'); named(englishPage, 'courseEnglishLink');
      article.append(englishPage);
      this.cards.append(article);
      if (course.id === this.openReviewId) {
        this.openReviewId = null;
        // Scroll once the panel is attached, so a landscape phone sees it, not just the short card.
        void reviews.onclick().then(() => article.scrollIntoView({ block: 'start' }));
      } else if (course.id === this.keepOpenId) {
        this.keepOpenId = null;
        void reviews.click();
      }
    }
  }
}

customElements.define('public-courses', PublicCourses);
