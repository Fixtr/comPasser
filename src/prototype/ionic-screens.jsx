import React, { useEffect, useRef, useState } from 'react';
import { IonButton, IonContent, IonModal, IonPage, IonProgressBar } from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { offlineTrips } from '../domains/itinerary/services/offline-trips.mjs';
import { normalizeData } from '../domains/itinerary/services/itinerary-normalize.mjs';
import { getLang } from '../utils/i18n.js';
import { plannerDraftStore } from '../domains/planner/services/planner-draft.mjs';
import { getCurrentUser, missingFirebaseConfig } from '../domains/auth/services/firebase-auth.js';
import { t } from '../utils/i18n.js';
import { TravelGlobe } from './travel-globe.jsx';
import { curatedRoute, PUBLIC_ROUTE_ID } from '../domains/itinerary/services/public-route.mjs';
import { addCourseToDraft, cityDestination } from '../domains/planner/services/course-draft.mjs';
import { destinations } from '../domains/planner/services/travel-destinations.mjs';
import { courseCity } from '../domains/itinerary/services/course-community.mjs';
import { CountryPicker } from './country-picker.jsx';
import { DestinationScreen } from './destination-screen.jsx';
import { useStageTransition } from './screen-transition.js';

let generatedPlan = null;

export function HomeScreen({ settings }) {
  const navigate = useNavigate();
  const location = useLocation();
  const active = ['/', '/home'].includes(location.pathname);
  const [importStatus, setImportStatus] = useState('');

  useEffect(() => {
    if (!active) return;
    const reviewId = new URLSearchParams(location.search).get('review');
    if (reviewId && /^[a-zA-Z0-9]+$/.test(reviewId)) {
      navigate(`/courses?review=${encodeURIComponent(reviewId)}`, { replace: true });
    }
  }, [active, location.search, navigate]);

  useEffect(() => {
    if (!active) return;
    const id = new URLSearchParams(location.search).get('course');
    if (!id || !PUBLIC_ROUTE_ID.test(id)) return;
    let cancelled = false;
    setImportStatus('publicRouteImporting');
    void (async () => {
      try {
        const course = curatedRoute(id) || await (await import('../domains/itinerary/services/public-course-service.js')).getPublicCourse(id);
        if (cancelled) return;
        if (!course) { setImportStatus('publicRouteGone'); return; }
        // Traveler courses store no city; take the catalogue city their stops match.
        const city = !course.destination && destinations.find(item => item.id === courseCity(course));
        plannerDraftStore.save(addCourseToDraft(plannerDraftStore.read(), city ? { ...course, destination: cityDestination(city) } : course, 'en'));
        navigate('/login?next=%2Fpreference%2F1', { replace: true });
      } catch { if (!cancelled) setImportStatus('publicRouteImportFailed'); }
    })();
    return () => { cancelled = true; };
  }, [active, location.search, navigate]);

  return <IonPage><IonContent className="ion-padding shell-content">
    {importStatus && <p role="status">{t(importStatus)}</p>}
    <div className="ionic-home-settings">{settings}</div>
    <div className="ionic-home">
      <div className="ionic-home-intro">
        <span className="shell-kicker">ComPasser</span>
        <h1>{t('flowHomeTitle')}</h1>
        <p>{t('flowHomeDescription')}</p>
      </div>
      <TravelGlobe active={active} onChooseCity={country => {
        plannerDraftStore.update({ country, destinationStage: 'city', step: '/destination' });
        navigate('/destination');
      }} />
      <nav className="ionic-home-links"><button onClick={() => navigate('/recommend')}>{t('shellRecommend')}</button><button onClick={() => navigate('/courses')}>{t('shellCourses')}</button></nav>
    </div>
  </IonContent></IonPage>;
}

export function RecommendScreen({ settings }) {
  const [country, setCountry] = useState('');
  const [city, setCity] = useState(null);
  const stageRef = useStageTransition(city?.id || country || 'country');
  const recommendationCities = destinations;
  const back = () => {
    if (city) setCity(null);
    else if (country) setCountry('');
    else window.navigate('/home');
  };
  return <IonPage><IonContent className="ion-padding shell-content">
    <div className="ionic-page-nav">
      <button onClick={back}>← {t('shellBack')}</button>
      {settings}
    </div>
    {city ? <DestinationScreen key={city.id} browseCity={city} embedded /> : <main ref={stageRef} className="flow-page">
      {!city && <h1>{t(country ? 'flowCity' : 'flowCountry')}</h1>}
      {!country && <CountryPicker kind="recommend" onSelect={setCountry} />}
      {country && !city && <div className="flow-choices country-grid city-grid">{recommendationCities.map(city => city.country === country ? <button key={city.id} data-recommend-city={city.id} onClick={() => setCity(city)}>{t(city.key)}</button> : null)}</div>}
    </main>}
  </IonContent></IonPage>;
}

export function CoursesScreen({ settings }) {
  const [country, setCountry] = useState('');
  const [city, setCity] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const stageRef = useStageTransition(city?.id || country || 'country');
  const courseCities = destinations;
  // Once the user picks or goes back, a late review-link lookup must not move them.
  const picked = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      import('../domains/planner/ui/home-courses.js'),
      import('../domains/planner/ui/public-courses.js'),
    ]).then(() => { if (active) setLoadState('ready'); })
      .catch(() => { if (active) setLoadState('error'); });
    // Review links (route pages, post-login return) open the course's city; public-courses then opens its panel.
    const reviewId = new URLSearchParams(window.location.search).get('review');
    if (/^[a-zA-Z0-9]+$/.test(reviewId || '')) void import('../domains/itinerary/services/public-course-service.js')
      .then(service => service.getPublicCourse(reviewId))
      .then(course => {
        const match = course && destinations.find(item => item.id === courseCity(course));
        if (active && match && !picked.current && window.location.pathname === '/courses') { setCountry(match.country); setCity(match); }
      })
      .catch(error => console.error('Review course unavailable:', error));
    return () => { active = false; };
  }, []);
  const back = () => {
    picked.current = true;
    if (city) setCity(null);
    else if (country) setCountry('');
    else window.navigate('/home');
  };
  return <IonPage><IonContent className="ion-padding shell-content">
    <div className="ionic-page-nav">
      <button onClick={back}>← {t('shellBack')}</button>
      {settings}
    </div>
    <main ref={stageRef} className="flow-page">
      <h1>{t(city ? 'courseBrowseTitle' : country ? 'flowCity' : 'flowCountry')}</h1>
      {!country && <CountryPicker kind="course" onSelect={next => { picked.current = true; setCountry(next); }} />}
      {country && !city && <div className="flow-choices country-grid city-grid">{courseCities.map(city => city.country === country ? <button key={city.id} data-course-city={city.id} onClick={() => { picked.current = true; setCity(city); }}>{t(city.key)}</button> : null)}</div>}
      {city && <div key={city.id}>
        <p>{t(`country${country}`)} · {t(city.key)}</p>
        {loadState === 'loading' && <p role="status">{t('discoveryScreenLoading')}</p>}
        {loadState === 'error' && <div role="alert"><p>{t('discoveryScreenFailed')}</p><button onClick={() => window.location.reload()}>{t('discoveryScreenReload')}</button></div>}
        {loadState === 'ready' && <><home-courses city={city.id} /><public-courses city={city.id} /></>}
      </div>}
    </main>
  </IonContent></IonPage>;
}

export function AuthScreen({ kind, search, settings }) {
  const verify = useRef(null);
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
  return <IonPage><IonContent className="ion-padding shell-content"><div className="ionic-page-nav"><button onClick={() => navigate(editingDates ? '/plan' : step === 1 ? '/destination' : '/preference/1')}>← {t('shellBack')}</button>{settings}</div><preference-view ref={view} /></IonContent></IonPage>;
}

export function PlanScreen({ user, settings }) {
  const form = useRef(null);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [phase, setPhase] = useState('form');
  const phaseRef = useStageTransition(phase);
  const [error, setError] = useState('');
  const run = useRef(0);

  useEffect(() => {
    if (pathname !== '/plan') return undefined;
    setPhase('form');
    plannerDraftStore.update({ step: search.includes('review=1') ? '/plan?review=1' : '/plan' });
    const element = form.current;
    let generate;
    let cancelled = false;
    const discard = () => { run.current++; element?.discardDraft?.(); setPhase('form'); };
    window.addEventListener('planner-draft-discarded', discard);
    const onGenerate = async event => {
      if (element?.isGenerating) return;
      element.isGenerating = true;
      const request = ++run.current;
      const userId = getCurrentUser()?.uid;
      setPhase('loading');
      setError('');
      try {
        const result = await generate(event.detail);
        if (request !== run.current || getCurrentUser()?.uid !== userId) return;
        generatedPlan = { userId, plan: result };
        plannerDraftStore.clear();
        navigate('/view');
      } catch (cause) {
        if (request === run.current) {
          setError(cause?.message || t('generationFail'));
          setPhase('error');
        }
      } finally {
        if (request === run.current) { element.isGenerating = false; window.dispatchEvent(new CustomEvent('itinerary-generation-complete')); }
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
      service.getGenerationCredits().then(balance => element?.setGenerationCredits(balance)).catch(() => element?.setGenerationCredits(null));
      element?.addEventListener('generate-itinerary', onGenerate);
    });
    return () => { cancelled = true; run.current++; window.removeEventListener('planner-draft-discarded', discard); if (element) { element.isGenerating = false; element.isSubmitting = false; } element?.removeEventListener('generate-itinerary', onGenerate); };
  }, [navigate, pathname, search, user?.uid]);

  return <IonPage><IonContent className="ion-padding shell-content">
    <div className="ionic-page-nav"><button onClick={() => navigate('/preference/2')}>← {t('shellBack')}</button>{settings}</div><div ref={phase === 'form' ? phaseRef : null} className={phase === 'form' ? '' : 'ionic-form-hidden'}><travel-form ref={form} handoff-flow="" /></div>
    {phase !== 'form' && <div ref={phaseRef} className="ionic-generation" role="status" aria-live="polite">
      {phase === 'loading' ? <><h2>{t('shellGenerating')}</h2><p>{t('shellGeneratingDescription')}</p><IonProgressBar type="indeterminate" /></>
        : <><h2>{t('shellGenerationFailed')}</h2><p role="alert">{error}</p><IonButton onClick={() => setPhase('form')}>{t('shellReturnToForm')}</IonButton></>}
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
  const [loaded, setLoaded] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const navigate = useNavigate();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const media = window.matchMedia('(min-width: 900px)');
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [offlineMode]);

  useEffect(() => {
    if (offlineMode) return undefined;
    let cancelled = false;
    void Promise.all([import('../domains/map/ui/map-view.js'), import('../domains/itinerary/ui/itinerary-view.js')])
      .then(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [offlineMode]);

  useEffect(() => {
    if (offlineMode || !active || !(desktop || ready) || !loaded || (!authSettled && !path.startsWith('/share/'))) return undefined;
    const view = itinerary.current;
    if (!view) return;
    view.setSessionUser(user?.uid || null);
    let cancelled = false;
    setShowEdit(false);
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

  const edit = () => {
    const view = itinerary.current;
    if (!view?.canEdit()) return;
    const request = view.currentItinerary?.request || view.currentItinerary?.metadata?.request;
    if (request) plannerDraftStore.save(request);
    navigate('/plan');
  };

  const map = <IonContent fullscreen scrollY={false} className="ionic-map-content">
      <map-view />
      <IonButton className="ionic-result-back" size="small" onClick={() => navigate(window.history.state?.idx > 0 ? -1 : '/')}>{t('shellBack')}</IonButton>
      {showEdit && <IonButton className="ionic-result-edit" size="small" onClick={edit}>{t('editItineraryBtn')}</IonButton>}
    </IonContent>;
  const schedule = <><div className="ionic-sheet-settings">{settings}</div><itinerary-view ref={itinerary} day-editing="" mobile-summary={desktop ? undefined : ''} /></>;

  if (offlineMode) {
    const id=path.match(/^\/view\/([a-zA-Z0-9]+)$/)?.[1];
    const saved=offlineTrips.get(user?.uid,id);
    return <IonPage><IonContent className="ion-padding shell-content"><div className="ionic-page-nav"><button onClick={()=>navigate(window.history.state?.idx > 0 ? -1 : '/profile/trips')}>← {t('shellBack')}</button>{settings}</div><main className="flow-page">
      <h1>{saved?.title || t('tabTrips')}</h1><p role="status">{t('offlineNotice')}</p>
      {saved ? <><p>{t('offlineSavedAt').replace('{0}',new Date(saved.savedAt).toLocaleString(getLang()==='en'?'en-US':'ko-KR'))}</p>{normalizeData(saved.itineraryPlan).days.map(day=><section key={day.day} className="offline-day"><h2>Day {day.day} · {day.date}</h2>{day.scheduleItems.map((item,index)=><article key={index}><strong>{item.time} – {item.endTime}</strong><h3>{item.resolvedName || item.title}</h3><p>{item.selectedPlace?.formattedAddress || item.verifiedPlace?.formattedAddress || item.resolvedAddress || item.location}</p></article>)}</section>)}</> : <p>{t('offlineEmpty')}</p>}
    </main></IonContent></IonPage>;
  }
  return <IonPage className="ionic-result-page">
    {desktop ? <div className="ionic-result-desktop">
      <aside className="ionic-desktop-schedule" aria-label={t('shellResult')}>{schedule}</aside>
      {map}
    </div> : <>
      {map}
      <IonModal className="ionic-result-sheet" canDismiss={!active} isOpen={active} animated={!reducedMotion}
      breakpoints={[0.3, 0.62, 1]} initialBreakpoint={0.62} backdropBreakpoint={0.62}
      handle handleBehavior="cycle" expandToScroll={false} onDidPresent={() => setReady(true)} onDidDismiss={() => setReady(false)}>
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
