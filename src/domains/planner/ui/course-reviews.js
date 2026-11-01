import { getCurrentUser, subscribeToAuthChanges } from '../../auth/services/firebase-auth.js';
import { listCourseReviews, getMyCourseReview, saveCourseReview, deleteCourseReview } from '../../itinerary/services/public-course-service.js';
import { courseSpentInWon } from '../../itinerary/services/course-community.mjs';
import { getPublicRouteUrl } from '../../itinerary/services/share-links.js';
import { t } from '../../../utils/i18n.js';
import { showConfirm } from '../../../utils/confirm-dialog.js';

class CourseReviews extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.reviews = [];
    this.sequence = 0;
    // Only an offline failure retries by itself; an online one keeps its retry button.
    this.reloadWhenOnline = () => { if (this.error && this.offline) void this.load(); };
  }

  connectedCallback() {
    // Reviews are public, so load them now instead of after auth settles (slow on a weak or lost
    // connection, which left the panel blank); load again only when the account changes.
    this.loadedFor = getCurrentUser()?.uid || null;
    void this.load();
    this.unsubscribe = subscribeToAuthChanges(user => {
      if ((user?.uid || null) === this.loadedFor) return;
      this.loadedFor = user?.uid || null;
      void this.load();
    });
    window.addEventListener('online', this.reloadWhenOnline);
  }

  disconnectedCallback() { this.sequence++; this.unsubscribe?.(); window.removeEventListener('online', this.reloadWhenOnline); }

  async load(more = false) {
    const sequence = ++this.sequence;
    this.busy = true;
    if (!more) this.render();
    try {
      const [result, mine] = await Promise.all([
        listCourseReviews(this.course, more ? this.cursor : null),
        more ? Promise.resolve(this.mine) : getMyCourseReview(this.course),
      ]);
      if (sequence !== this.sequence || !this.isConnected) return;
      this.reviews = more ? [...this.reviews, ...result.reviews] : result.reviews;
      this.cursor = result.cursor; this.hasMore = result.hasMore; this.mine = mine;
      this.error = false;
    } catch (error) {
      if (sequence !== this.sequence) return;
      console.error('Course reviews unavailable:', error);
      this.error = true;
      this.offline = navigator.onLine === false;
    } finally {
      if (sequence === this.sequence && this.isConnected) { this.busy = false; this.render(); }
    }
  }

  render() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>
      :host { display:block; margin-top:20px; border-top:1px solid var(--cp-rule); padding-top:16px; }
      p { line-height:1.6; color:var(--cp-ink-2); }
      section { padding:12px 0; border-bottom:1px solid var(--cp-rule); }
      .comment { white-space:pre-wrap; overflow-wrap:anywhere; }
      form, label { display:grid; gap:8px; } form { margin-top:20px; }
      input, textarea { box-sizing:border-box; width:100%; padding:10px; min-height:44px; font:inherit; color:var(--cp-ink); background:var(--cp-surface); border:1px solid var(--cp-rule); }
      textarea { min-height:100px; resize:vertical; }
      a { display:flex; align-items:center; width:fit-content; min-height:44px; font-size:13px; color:var(--cp-ink); text-underline-offset:3px; word-break:keep-all; }
      a:focus-visible { outline:2px solid var(--cp-ink); outline-offset:2px; }
      button { min-height:44px; padding:10px; font:inherit; cursor:pointer; color:var(--cp-ink); background:var(--cp-surface); border:1px solid var(--cp-rule); }
      button:focus-visible, input:focus-visible, textarea:focus-visible { outline:2px solid var(--cp-ink); outline-offset:2px; }
      button:disabled { opacity:.5; cursor:wait; }
    </style>`;
    const heading = document.createElement('h4'); heading.textContent = t('courseReviewsTitle');
    root.append(heading);
    const disclaimer = document.createElement('p'); disclaimer.textContent = t('courseReviewsDisclaimer'); root.append(disclaimer);
    // The directory lists only some traveler routes, so this is the app's way to the course's own page.
    const routePage = document.createElement('a'); routePage.href = getPublicRouteUrl(this.course.id); routePage.textContent = t('courseRoutePageLink'); root.append(routePage);
    if (this.busy || this.error) {
      const status = document.createElement('p'); status.setAttribute('role', 'status');
      // Loading failed: say so, not 'couldn't process', which reads like a submit failed.
      status.textContent = t(this.error ? (this.offline ? 'courseOffline' : 'courseReviewsLoadError') : 'courseReviewsLoading'); root.append(status);
      if (this.error && !this.offline) { const retry = document.createElement('button'); retry.textContent = t('courseReviewsRetry'); retry.onclick = () => void this.load(); root.append(retry); }
      return;
    }
    const inWon = courseSpentInWon(this.course);
    for (const review of this.reviews) {
      const section = document.createElement('section');
      const date = document.createElement('strong'); date.textContent = `${t('courseReviewVisitDate')}: ${review.visitDate}`;
      const numbers = document.createElement('p');
      numbers.textContent = [
        review.walkingKm == null ? '' : `${t('courseReviewWalkingLabel')}: ${review.walkingKm} km`,
        review.spentWon == null ? '' : `${t('courseReviewSpentLabel')}: ${inWon ? '₩' : ''}${review.spentWon.toLocaleString()}`,
        review.visitMinutes == null ? '' : `${t('courseReviewMinutesLabel')}: ${review.visitMinutes} ${t('courseReviewMinuteUnit')}`,
      ].filter(Boolean).join(' · ');
      const comment = document.createElement('p'); comment.className = 'comment'; comment.textContent = review.comment;
      section.append(date, numbers, comment); root.append(section);
    }
    if (!this.reviews.length) { const empty = document.createElement('p'); empty.textContent = t('courseReviewsEmpty'); root.append(empty); }
    if (this.hasMore) { const more = document.createElement('button'); more.textContent = t('courseReviewsMore'); more.onclick = () => { more.disabled = true; void this.load(true); }; root.append(more); }
    const user = getCurrentUser();
    if (!user) {
      const login = document.createElement('button'); login.textContent = t('courseReviewLogin');
      // Return to the same country and city: the kept /courses page shows whatever its address says.
      const here = new URLSearchParams(window.location.search);
      const place = here.get('city') ? { country: here.get('country'), city: here.get('city') } : {};
      login.onclick = () => window.navigate(`/login?next=${encodeURIComponent(`/courses?${new URLSearchParams({ ...place, review: this.course.id })}`)}`); root.append(login); return;
    }
    if (user.uid === this.course.ownerId) { const note = document.createElement('p'); note.textContent = t('courseReviewOwnerHint'); root.append(note); return; }
    const form = document.createElement('form');
    const today = new Date();
    const maxDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const inputs = {};
    for (const [name, key, type, max, step] of [
      ['visitDate', 'courseReviewVisitDate', 'date', maxDate, '1'],
      ['walkingKm', 'courseReviewWalking', 'number', 100, '0.1'],
      ['spentWon', inWon ? 'courseReviewSpent' : 'courseReviewSpentAbroad', 'number', 10000000, '1'],
      ['visitMinutes', 'courseReviewMinutes', 'number', 1440, '1'],
      ['comment', 'courseReviewComment', 'textarea'],
    ]) {
      const label = document.createElement('label'); label.append(document.createTextNode(t(key)));
      const input = document.createElement(type === 'textarea' ? 'textarea' : 'input'); input.name = name;
      if (type !== 'textarea') input.type = type;
      if (type === 'number') input.min = '0';
      if (max != null) input.max = String(max);
      if (step) input.step = step;
      if (type === 'textarea') input.maxLength = 600;
      input.required = ['visitDate', 'comment'].includes(name);
      input.value = this.mine?.[name] ?? '';
      inputs[name] = input; label.append(input); form.append(label);
    }
    const notice = document.createElement('p'); notice.textContent = t('courseReviewPublicNotice');
    const feedback = document.createElement('p'); feedback.setAttribute('role', 'status');
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = t(this.mine ? 'courseReviewUpdate' : 'courseReviewPublish');
    const disable = value => form.querySelectorAll('button,input,textarea').forEach(element => { element.disabled = value; });
    form.onsubmit = async event => {
      event.preventDefault();
      const approved = await showConfirm({ title: t('courseReviewPublish'), message: t('courseReviewPublicNotice'), confirmText: t('courseReviewPublish'), cancelText: t('cancelBtn') });
      if (!approved || getCurrentUser()?.uid !== user.uid || !this.isConnected) return;
      disable(true);
      try {
        await saveCourseReview(this.course, Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value])));
        await this.load();
      } catch (error) {
        feedback.textContent = t(error.message.startsWith('courseReview') ? error.message : 'courseReviewsError'); disable(false);
      }
    };
    form.append(notice, submit, feedback);
    if (this.mine) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = t('courseReviewDelete');
      remove.onclick = async () => {
        const approved = await showConfirm({ title: t('courseReviewDelete'), message: t('courseReviewDeleteNotice'), confirmText: t('deleteBtn'), cancelText: t('cancelBtn') });
        if (!approved || getCurrentUser()?.uid !== user.uid || !this.isConnected) return;
        disable(true);
        try { await deleteCourseReview(this.course.id); await this.load(); }
        catch { feedback.textContent = t('courseReviewsError'); disable(false); }
      };
      form.append(remove);
    }
    root.append(form);
  }
}

customElements.define('course-reviews', CourseReviews);
