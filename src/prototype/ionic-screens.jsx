import React, { useEffect, useRef, useState } from 'react';
import { IonButton, IonContent, IonModal, IonPage, IonProgressBar } from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { offlineTrips } from '../domains/itinerary/services/offline-trips.mjs';
import { normalizeData } from '../domains/itinerary/services/itinerary-normalize.mjs';
import { getLang } from '../utils/i18n.js';
import { plannerDraftStore } from '../domains/planner/services/planner-draft.mjs';
import { getCurrentUser, missingFirebaseConfig } from '../domains/auth/services/firebase-auth.js';
import { t } from '../utils/i18n.js';
import { showConfirm } from '../utils/confirm-dialog.js';
import { destinations, destinationById, destinationCountries } from '../domains/planner/services/travel-destinations.mjs';
import { courseCity } from '../domains/itinerary/services/course-community.mjs';
import { CountryPicker } from './country-picker.jsx';
import { DestinationScreen } from './destination-screen.jsx';
import { useStageTransition } from './screen-transition.js';

let generatedPlan = null;

// The country and city live in the URL, so Back steps up one level and a reload keeps them.
function usePlacePick(path) {
  const location = useLocation();
  const navigate = useNavigate();
  // Ionic keeps this page mounted under later routes; keep showing its own last address.
  const shown = useRef(location.search);
  if (location.pathname === path) shown.current = location.search;
  const query = new URLSearchParams(shown.current);
  // The address bar is untrusted: only known countries and cities of that country count.
  const city = destinations.find(item => item.id === query.get('city') && item.country === query.get('country')) || null;
  const country = city?.country || (destinationCountries.includes(query.get('country')) ? query.get('country') : '');
  const pick = next => navigate(`${path}?${new URLSearchParams(next)}`, { state: { picked: true } });
  const back = () => {
    // A step picked here sits right after its parent in history; a pasted or reloaded deep link may not.
    if (location.state?.picked) navigate(-1);
    else if (city) navigate(`${path}?country=${country}`, { replace: true });
    else if (country) navigate(path, { replace: true });
    else window.navigate('/home');
  };
  return { country, city, pick, back };
}

export function RecommendScreen({ settings }) {
  const { country, city, pick, back } = usePlacePick('/recommend');
  const stageRef = useStageTransition(city?.id || country || 'country');
  const recommendationCities = destinations;
  return <IonPage><IonContent className="ion-padding shell-content">
    <div className="ionic-page-nav">
      <button onClick={back}><span aria-hidden="true">←</span> {t('shellBack')}</button>
      {settings}
    </div>
    {city ? <DestinationScreen key={city.id} browseCity={city} embedded /> : <section ref={stageRef} className="flow-page">
      {!city && <h1>{t(country ? 'flowCity' : 'flowCountry')}</h1>}
      {!country && <CountryPicker kind="recommend" onSelect={next => pick({ country: next })} />}
      {country && !city && <div className="flow-choices country-grid city-grid">{recommendationCities.map(city => city.country === country ? <button key={city.id} data-recommend-city={city.id} onClick={() => pick({ country, city: city.id })}>{t(city.key)}</button> : null)}</div>}
    </section>}
  </IonContent></IonPage>;
}

export function CoursesScreen({ settings }) {
  const { country, city, pick: pickPlace, back: backPlace } = usePlacePick('/courses');
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState('loading');
  // A review link whose course is gone or cannot be read says so above the country picker.
  const [reviewNotice, setReviewNotice] = useState('');
  const stageRef = useStageTransition(city?.id || country || 'country');
  const courseCities = destinations;
  // Once the user picks or goes back, a late review-link lookup must not move them.
  const picked = useRef(false);
  const pick = next => { picked.current = true; setReviewNotice(''); pickPlace(next); };
  useEffect(() => {
    let active = true;
    void Promise.all([
      import('../domains/planner/ui/home-courses.js'),
      import('../domains/planner/ui/public-courses.js'),
    ]).then(() => { if (active) setLoadState('ready'); })
      .catch(() => { if (active) setLoadState('error'); });
    // Review links (route pages, post-login return) open the course's city; public-courses then opens its panel.
    const query = new URLSearchParams(window.location.search);
    const reviewId = query.get('review');
    if (/^[a-zA-Z0-9]+$/.test(reviewId || '') && !query.get('city')) void import('../domains/itinerary/services/public-course-service.js')
      .then(service => service.getPublicCourse(reviewId))
      .then(course => {
        const match = course && destinations.find(item => item.id === courseCity(course));
        // Only a course that is gone says so; a public course outside the catalogue cities still opens nothing, quietly.
        if (active && !course && !picked.current) setReviewNotice('courseReviewMissing');
        if (active && match && !picked.current && window.location.pathname === '/courses') navigate(`/courses?${new URLSearchParams({ country: match.country, city: match.id, review: reviewId })}`, { replace: true });
      })
      .catch(error => { console.error('Review course unavailable:', error); if (active && !picked.current) setReviewNotice('courseReviewUnavailable'); });
    return () => { active = false; };
  }, []);
  const back = () => {
    picked.current = true;
    setReviewNotice('');
    backPlace();
  };
  return <IonPage><IonContent className="ion-padding shell-content">
    <div className="ionic-page-nav">
      <button onClick={back}><span aria-hidden="true">←</span> {t('shellBack')}</button>
      {settings}
    </div>
    <section ref={stageRef} className="flow-page">
      <h1>{t(city ? 'courseBrowseTitle' : country ? 'flowCity' : 'courseCountryTitle')}</h1>
      {!country && reviewNotice && <p role="status">{t(reviewNotice)}</p>}
      {!country && <CountryPicker kind="course" onSelect={next => pick({ country: next })} />}
      {country && !city && <div className="flow-choices country-grid city-grid">{courseCities.map(city => city.country === country ? <button key={city.id} data-course-city={city.id} onClick={() => pick({ country, city: city.id })}>{t(city.key)}</button> : null)}</div>}
      {city && <div key={city.id}>
        <p>{t(`country${country}`)} · {t(city.key)}</p>
        {loadState === 'loading' && <p role="status">{t('discoveryScreenLoading')}</p>}
        {loadState === 'error' && <div role="alert"><p>{t('discoveryScreenFailed')}</p><button onClick={() => window.location.reload()}>{t('discoveryScreenReload')}</button></div>}
        {loadState === 'ready' && <><home-courses city={city.id} /><public-courses city={city.id} /></>}
      </div>}
    </section>
  </IonContent></IonPage>;
}

// Says why sign-in is asked; for planning it names only what the guest draft really holds.
function authReason(search) {
  const next = new URLSearchParams(search).get('next') || '';
  if (next.startsWith('/profile')) return t('authReasonAccount');
  if (!['/preference/1', '/preference/2', '/plan'].includes(next)) return '';
  const { destination, anchorSchedules } = plannerDraftStore.read();
  const city = destinationById(destination?.id);
  if (!city) return t('authReasonPlan');
  return anchorSchedules.length
    ? t('authReasonPlaces').replace('{0}', anchorSchedules.length).replace('{1}', t(city.key))
    : t('authReasonCity').replace('{0}', t(city.key));
}

export function AuthScreen({ kind, search, settings }) {
  const verify = useRef(null);
  const reason = kind === 'verify' ? '' : authReason(search);
  useEffect(() => {
    let cancelled = false;
    const modules = {
      login: () => import('../domains/auth/ui/login-view.js'),
      join: () => import('../domains/auth/ui/join-view.js'),
      verify: () => import('../domains/auth/ui/verify-view.js'),
    };
    void modules[kind]().then(() => {
      if (!cancelled && kind === 'verify') verify.current?.verify(new URLSearchParams(search).get('oobCode'));
    });
    return () => { cancelled = true; };
  }, [kind, search]);
  return <IonPage><IonContent className="ion-padding shell-content">
    <div className="ionic-page-nav"><button onClick={() => window.navigate('/home')}>ComPasser</button>{settings}</div>
    <div className="ionic-legacy-auth">
      {!!missingFirebaseConfig.length && <p role="alert">{t('configErrorBody').replace('{0}', missingFirebaseConfig.join(', '))}</p>}
      {reason && <p className="ionic-auth-reason">{reason}</p>}
      {kind === 'login' ? <login-view /> : kind === 'join' ? <join-view /> : <verify-view ref={verify} />}
    </div>
  </IonContent></IonPage>;
}

export function PreferenceScreen({ step, settings, active }) {
  const view = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const editingDates = step === 1 && location.state?.returnTo === '/plan';
  useEffect(() => {
    if (!active) return undefined;
    plannerDraftStore.update({ step: `/preference/${step}` });
    let cancelled = false;
    if (step === 2 && !plannerDraftStore.read().date.length) {
      navigate('/preference/1', { replace: true });
      return undefined;
    }
    void import('../domains/planner/ui/preference-view.js').then(() => {
      if (!cancelled) view.current?.setStep(step, { returnToPlan: editingDates });
    });
    return () => { cancelled = true; };
  }, [step, navigate, active, editingDates]);
  return <IonPage><IonContent className="ion-padding shell-content"><div className="ionic-page-nav"><button onClick={() => navigate(editingDates ? '/plan' : step === 1 ? '/destination' : '/preference/1')}><span aria-hidden="true">←</span> {t('shellBack')}</button>{settings}</div><preference-view ref={view} /></IonContent></IonPage>;
}

const GENERATION_STAGES = [['draft', 'shellStageDraft'], ['places', 'shellStagePlaces'], ['routes', 'shellStageRoutes']];

export function PlanScreen({ user, settings }) {
  const form = useRef(null);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [phase, setPhase] = useState('form');
  const phaseRef = useStageTransition(phase);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [stage, setStage] = useState('draft');
  const retry = useRef(null);
  const run = useRef(0);
  const creditsUid = useRef();

  useEffect(() => {
    if (pathname !== '/plan') return undefined;
    setPhase('form');
    plannerDraftStore.update({ step: search.includes('review=1') ? '/plan?review=1' : '/plan' });
    const element = form.current;
    // Another account's balance (a zero blocks the button) must not show while this one loads; the element is defined after its lazy import.
    if (creditsUid.current !== user?.uid) { creditsUid.current = user?.uid; element?.setGenerationCredits?.(undefined); }
    let generate;
    let loadCredits = () => {};
    let cancelled = false;
    let stopping = null;
    const discard = () => { run.current++; element?.discardDraft?.(); setPhase('form'); };
    window.addEventListener('planner-draft-discarded', discard);
    // Leaving during generation only stops it: the server still finishes, so the inputs stay and its result is ignored.
    const stop = async () => {
      if (stopping) return;
      stopping = new AbortController();
      const accepted = await showConfirm({ title: t('planStopTitle'), message: t(element.generationCredits === 'unlimited' ? 'planStopMessageUnlimited' : 'planStopMessage'), confirmText: t('planStopYes'), cancelText: t('planStopNo'), signal: stopping.signal });
      stopping = null;
      if (!accepted || !element?.isGenerating) return;
      run.current++;
      element.isGenerating = false;
      setPhase('form');
      window.dispatchEvent(new CustomEvent('itinerary-generation-complete'));
      loadCredits();
      element.showReview();
    };
    const exitRequested = event => { if (element?.isGenerating) { event.preventDefault(); void stop(); } };
    window.addEventListener('plan-exit-requested', exitRequested);
    const onGenerate = async event => {
      if (element?.isGenerating) return;
      element.isGenerating = true;
      const request = ++run.current;
      const userId = getCurrentUser()?.uid;
      retry.current = () => onGenerate(event);
      setPhase('loading');
      setStage('draft');
      setError('');
      try {
        const result = await generate(event.detail, { onStage: next => { if (request === run.current) setStage(next); } });
        if (request !== run.current || getCurrentUser()?.uid !== userId) return;
        generatedPlan = { userId, plan: result };
        plannerDraftStore.clear();
        navigate('/view');
      } catch (cause) {
        if (request === run.current) {
          setError(cause?.outcomeUnknown && element.generationCredits === 'unlimited' ? t('generationOutcomeUnknownUnlimited') : cause?.message || t('generationFail'));
          setRetryable(cause?.retryable === true);
          setPhase('error');
        }
      } finally {
        // Each attempt may spend or refund a credit, so the review shows the server's balance on return.
        loadCredits();
        if (request === run.current) { stopping?.abort(); element.isGenerating = false; window.dispatchEvent(new CustomEvent('itinerary-generation-complete')); }
      }
    };
    void Promise.all([
      import('../domains/planner/ui/travel-form.js'),
      import('../domains/planner/services/gemini-optimizer.js'),
    ]).then(([, service]) => {
      if (cancelled) return;
      generate = service.generateOptimizedItinerary;
      element?.refreshFromStorage();
      if (search.includes('review=1')) element?.showReview();
      element?.renderPreferenceBadges();
      element?.syncDateFloor();
      loadCredits = () => service.getGenerationCredits().then(balance => { if (!cancelled) element?.setGenerationCredits(balance); }).catch(() => { if (!cancelled) element?.setGenerationCredits(null); });
      loadCredits();
      element?.addEventListener('generate-itinerary', onGenerate);
    });
    return () => { cancelled = true; run.current++; stopping?.abort(); window.removeEventListener('planner-draft-discarded', discard); window.removeEventListener('plan-exit-requested', exitRequested); if (element) { element.isGenerating = false; element.isSubmitting = false; } element?.removeEventListener('generate-itinerary', onGenerate); };
  }, [navigate, pathname, search, user?.uid]);

  return <IonPage><IonContent className="ion-padding shell-content">
    <div className="ionic-page-nav"><button onClick={() => navigate('/preference/2')}><span aria-hidden="true">←</span> {t('shellBack')}</button>{settings}</div><div ref={phase === 'form' ? phaseRef : null} className={phase === 'form' ? '' : 'ionic-form-hidden'}><travel-form ref={form} handoff-flow="" /></div>
    {phase !== 'form' && <div ref={phaseRef} className="ionic-generation" role="status" aria-live="polite">
      {phase === 'loading' ? <><h2>{t('shellGenerating')}</h2>
        <ol className="ionic-generation-steps" aria-hidden="true">{GENERATION_STAGES.map(([key, label]) => <li key={key} aria-current={key === stage ? 'step' : undefined}>{t(label)}</li>)}</ol>
        <p className="ionic-visually-hidden">{t(GENERATION_STAGES.find(([key]) => key === stage)[1])}</p>
        <p>{t('shellGeneratingWait')}</p><IonProgressBar type="indeterminate" /></>
        : <><h2>{t('shellGenerationFailed')}</h2><p role="alert">{error}</p>
          {retryable && <IonButton onClick={() => retry.current?.()}>{t('shellRetry')}</IonButton>}
          <IonButton fill={retryable ? 'outline' : 'solid'} onClick={() => setPhase('form')}>{t('shellReturnToForm')}</IonButton></>}
    </div>}
  </IonContent></IonPage>;
}

export function ResultScreen({ path, active, user, authSettled, settings }) {
  const itinerary = useRef(null);
  const location = useLocation();
  const [offline, setOffline]=useState(navigator.onLine===false);
  const offlineMode = offline || new URLSearchParams(location.search).get('offline') === '1';
  useEffect(() => { const update=()=>setOffline(navigator.onLine===false); window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);}; }, []);
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  const [ready, setReady] = useState(false);
  // The sheet unmounts without onDidDismiss on desktop and offline; the next sheet must present before it loads.
  if (ready && (desktop || offlineMode)) setReady(false);
  const [loaded, setLoaded] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  // A missing or failed trip has no map to show: the card takes the full width and carries its own Back.
  const [missing, setMissing] = useState(false);
  const navigate = useNavigate();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sheet = useRef(null);
  const fullSheet = useRef(false);
  // Ionic leaves the sheet unnamed and its handle in English, with no prop for either, so set them in its shadow root
  // after every render (a language switch re-renders). Below full height the map's Back and Edit stay usable beside it,
  // so it is modal only at full height, where Ionic covers the map and traps focus.
  const nameSheet = () => {
    const root = sheet.current?.shadowRoot;
    const dialog = root?.querySelector('[role=dialog]');
    dialog?.setAttribute('aria-label', t('shellResult'));
    dialog?.setAttribute('aria-modal', String(fullSheet.current));
    root?.querySelector('.modal-handle')?.setAttribute('aria-label', t('sheetResize'));
  };
  useEffect(nameSheet);
  // The view reports a deleted, missing or unreadable trip, also when a later recheck finds it gone.
  useEffect(() => {
    const view = itinerary.current;
    const onMissing = () => setMissing(true);
    view?.addEventListener('itinerary-missing', onMissing);
    return () => view?.removeEventListener('itinerary-missing', onMissing);
  }, [loaded, desktop, offlineMode]);
  // A page kept in the outlet must not carry the last trip's state into the next one.
  useEffect(() => { if (!active) setMissing(false); }, [active]);
  // On a phone the missing-trip card opens to full height instead of leaving an empty map above it.
  useEffect(() => { if (missing && ready && active && !desktop) void sheet.current?.setCurrentBreakpoint(1); }, [missing, ready, active, desktop]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 900px)');
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [offlineMode]);

  useEffect(() => {
    if (offlineMode) return undefined;
    let cancelled = false;
    // null (falsy) marks a failed load, so the effects below still wait for the views.
    void Promise.all([import('../domains/map/ui/map-view.js'), import('../domains/itinerary/ui/itinerary-view.js')])
      .then(() => { if (!cancelled) setLoaded(true); }, () => { if (!cancelled) setLoaded(null); });
    // A saved or shared trip needs the Firestore SDK; fetch it alongside the views instead of after them.
    if (/^\/(?:view|share)\//.test(path)) void import('../lib/firestore-lazy.mjs').then(lazy => lazy.loadFirestore()).catch(() => {});
    return () => { cancelled = true; };
  }, [offlineMode]);

  useEffect(() => {
    if (offlineMode || !active || !(desktop || ready) || !loaded || (!authSettled && !path.startsWith('/share/'))) return undefined;
    const view = itinerary.current;
    if (!view) return;
    view.setSessionUser(user?.uid || null);
    let cancelled = false;
    setShowEdit(false);
    setMissing(false);
    const match = path.match(/^\/(view|share)\/([a-zA-Z0-9]+)$/);
    if (match) void view.loadItineraryById(match[2], { sharedOnly: match[1] === 'share', userId: user?.uid })
      .then(() => { if (!cancelled) setShowEdit(view.canEdit()); });
    else if (path === '/view') {
      if (generatedPlan?.userId === user?.uid) {
        view.showResults(generatedPlan.plan);
        generatedPlan = null;
      } else {
        generatedPlan = null;
        if (!view.restoreDraft()) navigate('/plan', { replace: true });
      }
      setShowEdit(view.canEdit());
    }
    return () => { cancelled = true; view.cancelPendingLoad(); };
  }, [ready, desktop, loaded, active, authSettled, path, user?.uid, navigate, offlineMode]);

  // Generation success clears the planner, so the result's own request is the only copy of the inputs.
  const keepInputs = view => {
    const request = view.currentItinerary?.request || view.currentItinerary?.metadata?.request;
    if (request) plannerDraftStore.save(request);
  };
  const edit = () => {
    const view = itinerary.current;
    if (!view?.canEdit()) return;
    keepInputs(view);
    navigate('/plan');
  };
  const leaveDialog = useRef(null);
  // A route change closes the leave question instead of leaving it over the next page.
  useEffect(() => () => leaveDialog.current?.abort(), [active, path]);
  const back = async () => {
    const view = itinerary.current;
    const editable = view?.currentItinerary && view.canEdit();
    // Bare /view only shows the unsaved generated draft; saving moves to /view/:id.
    if (editable && path === '/view') {
      leaveDialog.current = new AbortController();
      const leave = await showConfirm({ title: t('resultLeaveTitle'), message: t('resultLeaveMessage'), confirmText: t('planLeaveYes'), cancelText: t('planLeaveNo'), signal: leaveDialog.current.signal });
      if (!leave || window.location.pathname !== path) return;
      keepInputs(view);
    // Saving a fresh result replaces /view, so the planner sits right behind it and needs its inputs back.
    } else if (editable && view.state.current?.savedFromDraft) keepInputs(view);
    navigate(window.history.state?.idx > 0 ? -1 : '/');
  };

  const map = <IonContent fullscreen scrollY={false} className="ionic-map-content">
      <map-view />
      <IonButton className="ionic-result-back" size="small" onClick={() => void back()}>{t('shellBack')}</IonButton>
      {showEdit && <IonButton className="ionic-result-edit" size="small" onClick={edit}>{t('editItineraryBtn')}</IonButton>}
    </IonContent>;
  const schedule = <><div className="ionic-sheet-settings">{missing && <button className="ionic-result-missing-back" onClick={() => void back()}><span aria-hidden="true">←</span> {t('shellBack')}</button>}{settings}</div>{loaded === false && <p className="ionic-result-loading" role="status">{t('resultLoading')}</p>}{loaded === null && <div role="alert"><p>{t('discoveryScreenFailed')}</p><button onClick={() => window.location.reload()}>{t('discoveryScreenReload')}</button></div>}<itinerary-view ref={itinerary} day-editing="" mobile-summary={desktop ? undefined : ''} /></>;

  if (offlineMode) {
    const id=path.match(/^\/view\/([a-zA-Z0-9]+)$/)?.[1];
    const saved=offlineTrips.get(user?.uid,id);
    return <IonPage><IonContent className="ion-padding shell-content"><div className="ionic-page-nav"><button onClick={()=>navigate(window.history.state?.idx > 0 ? -1 : '/profile/trips')}><span aria-hidden="true">←</span> {t('shellBack')}</button>{settings}</div><section className="flow-page">
      <h1>{saved?.title || t('tabTrips')}</h1><p role="status">{t('offlineNotice')}</p>
      {saved ? <><p>{t('offlineSavedAt').replace('{0}',new Date(saved.savedAt).toLocaleString(getLang()==='en'?'en-US':'ko-KR'))}</p>{normalizeData(saved.itineraryPlan).days.map(day=><section key={day.day} className="offline-day"><h2>Day {day.day} · {day.date}</h2>{day.scheduleItems.map((item,index)=><article key={index}><strong>{item.time} – {item.endTime}</strong><h3>{(!item.stayUnsetLabel && item.resolvedName) || item.title}</h3><p>{item.stayUnsetLabel || item.selectedPlace?.formattedAddress || item.verifiedPlace?.formattedAddress || item.resolvedAddress || item.location}</p></article>)}</section>)}</> : <p>{t('offlineEmpty')}</p>}
    </section></IonContent></IonPage>;
  }
  return <IonPage className="ionic-result-page">
    {desktop ? <div className={`ionic-result-desktop${missing ? ' ionic-result-missing' : ''}`}>
      <aside className="ionic-desktop-schedule" aria-label={t('shellResult')}>{schedule}</aside>
      {map}
    </div> : <>
      {map}
      <IonModal ref={sheet} className="ionic-result-sheet" canDismiss={!active} isOpen={active} animated={!reducedMotion}
      breakpoints={[0.3, 0.62, 1]} initialBreakpoint={0.62} backdropBreakpoint={0.62}
      handle handleBehavior="cycle" expandToScroll={false} onDidPresent={() => { nameSheet(); setReady(true); }}
      onIonBreakpointDidChange={event => { fullSheet.current = event.detail.breakpoint > 0.62; nameSheet(); }} onDidDismiss={() => setReady(false)}>
        <IonContent className="ionic-result-sheet-content">{schedule}</IonContent>
      </IonModal>
    </>}
  </IonPage>;
}

export function ProfileScreen({ tab, settings, active }) {
  const view = useRef(null);
  const location = useLocation();
  useEffect(() => {
    let cancelled = false;
    if (!active) return undefined;
    void import('../domains/profile/ui/profile-view.js').then(() => { if (!cancelled) { view.current?.setTabFromPath(tab); view.current?.loadUserData(); view.current?.fetchItineraries(); } });
    return () => { cancelled = true; };
  }, [tab, active, location.search]);
  return <IonPage><IonContent className="ion-padding shell-content"><div className="ionic-page-nav"><button onClick={() => window.navigate('/home')}>{t('profileGoHome')}</button>{settings}</div><profile-view ref={view} data-active={active ? '' : undefined} standalone-trips={tab === 'trips' && location.pathname === '/profile/trips' ? '' : undefined} /></IonContent></IonPage>;
}

export function AccountDeletionScreen({ settings }) {
  const view = useRef(null);
  useEffect(() => {
    let cancelled = false;
    void import('../domains/profile/ui/account-deletion-status-view.js').then(() => { if (!cancelled) void view.current?.refresh(); });
    return () => { cancelled = true; };
  }, []);
  return <IonPage><IonContent className="ion-padding shell-content"><div className="ionic-page-nav"><button onClick={() => window.navigate('/home')}>ComPasser</button>{settings}</div><account-deletion-status-view ref={view} /></IonContent></IonPage>;
}
