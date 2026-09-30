import React, { useEffect, useRef, useState } from 'react';
import { IonButton, IonContent, IonModal, IonPage, IonProgressBar } from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { plannerDraftStore } from '../domains/planner/services/planner-draft.mjs';
import { getCurrentUser, missingFirebaseConfig } from '../domains/auth/services/firebase-auth.js';
import { t } from '../utils/i18n.js';
import '../domains/planner/ui/home-recommendations.js';

let generatedPlan = null;

export function HomeScreen({ user }) {
  const navigate = useNavigate();
  return <IonPage><IonContent className="ion-padding shell-content">
    <div className="ionic-home">
      <div className="ionic-home-intro">
        <span className="shell-kicker">COMPASSER</span>
        <h1>{t('shellHomeTitle')}</h1>
        <p>{t('shellHomeDescription')}</p>
        <div className="ionic-home-actions">
          <IonButton className="ionic-home-new" expand="block" onClick={() => navigate(user ? '/preference/1' : '/login')}>{t(user ? 'shellNewTrip' : 'shellStart')}</IonButton>
          {user && <IonButton className="ionic-home-trips" expand="block" fill="outline" onClick={() => navigate('/profile/trips')}>{t('myItineraries')}</IonButton>}
        </div>
      </div>
      <home-recommendations />
    </div>
  </IonContent></IonPage>;
}

export function AuthScreen({ kind, search }) {
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
    <div className="ionic-legacy-auth">
      {!!missingFirebaseConfig.length && <p role="alert">{t('configErrorBody').replace('{0}', missingFirebaseConfig.join(', '))}</p>}
      {kind === 'login' ? <login-view /> : kind === 'join' ? <join-view /> : <verify-view ref={verify} />}
    </div>
  </IonContent></IonPage>;
}

export function PreferenceScreen({ step }) {
  const view = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    if (step === 2 && !plannerDraftStore.read().date.length) {
      navigate('/preference/1', { replace: true });
      return undefined;
    }
    void import('../domains/planner/ui/preference-view.js').then(() => {
      if (!cancelled) view.current?.setStep(step);
    });
    return () => { cancelled = true; };
  }, [step, navigate]);
  return <IonPage><IonContent className="ion-padding shell-content"><preference-view ref={view} /></IonContent></IonPage>;
}

export function PlanScreen({ user }) {
  const form = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [phase, setPhase] = useState('form');
  const [error, setError] = useState('');
  const run = useRef(0);

  useEffect(() => {
    if (pathname !== '/plan') return undefined;
    setPhase('form');
    const element = form.current;
    let generate;
    let cancelled = false;
    const onGenerate = async event => {
      const request = ++run.current;
      const userId = getCurrentUser()?.uid;
      setPhase('loading');
      setError('');
      try {
        const result = await generate(event.detail);
        if (request !== run.current || getCurrentUser()?.uid !== userId) return;
        generatedPlan = { userId, plan: result };
        navigate('/view');
      } catch (cause) {
        if (request === run.current) {
          setError(cause?.message || t('generationFail'));
          setPhase('error');
        }
      } finally {
        window.dispatchEvent(new CustomEvent('itinerary-generation-complete'));
      }
    };
    void Promise.all([
      import('../domains/planner/ui/travel-form.js'),
      import('../domains/planner/services/gemini-optimizer.js'),
    ]).then(([, service]) => {
      if (cancelled) return;
      generate = service.generateOptimizedItinerary;
      element?.renderPreferenceBadges();
      element?.syncDateFloor();
      service.getGenerationCredits().then(balance => element?.setGenerationCredits(balance)).catch(() => element?.setGenerationCredits(null));
      element?.addEventListener('generate-itinerary', onGenerate);
    });
    return () => { cancelled = true; run.current++; element?.removeEventListener('generate-itinerary', onGenerate); };
  }, [navigate, pathname, user?.uid]);

  return <IonPage><IonContent className="ion-padding shell-content">
    <div className={phase === 'form' ? '' : 'ionic-form-hidden'}><travel-form ref={form} /></div>
    {phase !== 'form' && <div className="ionic-generation" role="status" aria-live="polite">
      {phase === 'loading' ? <><h2>{t('shellGenerating')}</h2><p>{t('shellGeneratingDescription')}</p><IonProgressBar type="indeterminate" /></>
        : <><h2>{t('shellGenerationFailed')}</h2><p role="alert">{error}</p><IonButton onClick={() => setPhase('form')}>{t('shellReturnToForm')}</IonButton></>}
    </div>}
  </IonContent></IonPage>;
}

export function ResultScreen({ path, active, user, authSettled, settings }) {
  const itinerary = useRef(null);
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([import('../domains/map/ui/map-view.js'), import('../domains/itinerary/ui/itinerary-view.js')])
      .then(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!active || !(desktop || ready) || !loaded || (!authSettled && !path.startsWith('/share/'))) return undefined;
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
  }, [ready, desktop, loaded, active, authSettled, path, user?.uid, navigate]);

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
  const schedule = <><div className="ionic-sheet-settings">{settings}</div><itinerary-view ref={itinerary} mobile-summary={desktop ? undefined : ''} /></>;

  return <IonPage className="ionic-result-page">
    {desktop ? <div className="ionic-result-desktop">
      <aside className="ionic-desktop-schedule" aria-label={t('shellResult')}>{schedule}</aside>
      {map}
    </div> : <>
      {map}
      <IonModal className="ionic-result-sheet" isOpen={active} canDismiss={false} animated={!reducedMotion}
      breakpoints={[0.3, 0.62, 1]} initialBreakpoint={0.62} backdropBreakpoint={0.62}
      handle handleBehavior="cycle" expandToScroll={false} onDidPresent={() => setReady(true)} onDidDismiss={() => setReady(false)}>
        <IonContent className="ionic-result-sheet-content">{schedule}</IonContent>
      </IonModal>
    </>}
  </IonPage>;
}

export function ProfileScreen({ tab }) {
  const view = useRef(null);
  useEffect(() => {
    let cancelled = false;
    void import('../domains/profile/ui/profile-view.js').then(() => { if (!cancelled) view.current?.setTabFromPath(tab); });
    return () => { cancelled = true; };
  }, [tab]);
  return <IonPage><IonContent className="ion-padding shell-content"><profile-view ref={view} /></IonContent></IonPage>;
}

export function AccountDeletionScreen() {
  const view = useRef(null);
  useEffect(() => {
    let cancelled = false;
    void import('../domains/profile/ui/account-deletion-status-view.js').then(() => { if (!cancelled) void view.current?.refresh(); });
    return () => { cancelled = true; };
  }, []);
  return <IonPage><IonContent className="ion-padding shell-content"><account-deletion-status-view ref={view} /></IonContent></IonPage>;
}
