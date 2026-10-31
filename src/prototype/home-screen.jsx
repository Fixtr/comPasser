import React, { lazy, Suspense, useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { plannerDraftStore } from '../domains/planner/services/planner-draft.mjs';
import { t } from '../utils/i18n.js';

// The world map data and d3 are about 50 KB gzip; home paints its text first and the globe follows.
const TravelGlobe = lazy(() => import('./travel-globe.jsx').then(module => ({ default: module.TravelGlobe })));

export function HomeScreen({ authSettled, settings }) {
  const navigate = useNavigate();
  const location = useLocation();
  const active = ['/', '/home'].includes(location.pathname);
  const [importStatus, setImportStatus] = useState('');
  const [pickedCountry, setPickedCountry] = useState(null);

  // The saved draft is restored when auth settles; saving a pick earlier would overwrite it.
  useEffect(() => {
    if (!pickedCountry) return;
    if (!active) { setPickedCountry(null); return; }
    if (!authSettled) return;
    setPickedCountry(null);
    plannerDraftStore.update({ country: pickedCountry, destinationStage: 'city', step: '/destination' });
    navigate('/destination');
  }, [pickedCountry, active, authSettled, navigate]);

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
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const [{ curatedRoute, PUBLIC_ROUTE_ID }, { addCourseToDraft, cityDestination }, { destinations }, { courseCity }] = await Promise.all([
          import('../domains/itinerary/services/public-route.mjs'),
          import('../domains/planner/services/course-draft.mjs'),
          import('../domains/planner/services/travel-destinations.mjs'),
          import('../domains/itinerary/services/course-community.mjs'),
        ]);
        if (cancelled || !PUBLIC_ROUTE_ID.test(id)) return;
        setImportStatus('publicRouteImporting');
        // The saved draft is restored when auth settles; importing earlier would overwrite it in a new tab.
        if (!authSettled) return;
        // The English route page hands over the typed start directly, in case another account's draft was dropped.
        // Taken before the lookup, so a missing course does not leave it for a later one; the next route-page click also resets it.
        let start = null;
        try { start = sessionStorage.getItem('compasser.routeStart'); sessionStorage.removeItem('compasser.routeStart'); } catch { /* storage blocked: keep the draft's start */ }
        const course = curatedRoute(id) || await (await import('../domains/itinerary/services/public-course-service.js')).getPublicCourse(id);
        if (cancelled) return;
        if (!course) { setImportStatus('publicRouteGone'); return; }
        // Traveler courses store no city; take the catalogue city their stops match.
        const city = !course.destination && destinations.find(item => item.id === courseCity(course));
        const draft = addCourseToDraft(plannerDraftStore.read(), city ? { ...course, destination: cityDestination(city) } : course, 'en');
        plannerDraftStore.save(start ? { ...draft, startLocation: start } : draft);
        navigate('/login?next=%2Fpreference%2F1', { replace: true });
      } catch { if (!cancelled) setImportStatus('publicRouteImportFailed'); }
    })();
    return () => { cancelled = true; };
  }, [active, authSettled, location.search, navigate]);

  return <IonPage><IonContent className="ion-padding shell-content">
    {importStatus && <p role="status">{t(importStatus)}</p>}
    {pickedCountry && <p role="status">{t('loadingModal')}</p>}
    <div className="ionic-home-settings">{settings}</div>
    <div className="ionic-home">
      <div className="ionic-home-intro">
        <span className="shell-kicker">ComPasser</span>
        <h1>{t('flowHomeTitle')}</h1>
        <p>{t('flowHomeDescription')}</p>
      </div>
      {/* Above the globe so the two entries stay above the tab bar on short phones. */}
      <nav className="ionic-home-links"><button onClick={() => navigate('/recommend')}>{t('shellRecommend')}</button><button onClick={() => navigate('/courses')}>{t('shellCourses')}</button></nav>
      <Suspense fallback={<section className="travel-globe"><div className="globe-stage" /><h2>{t('flowDiscoverTitle')}</h2><p>{t('flowDiscoverDescription')}</p></section>}><TravelGlobe active={active} onChooseCity={setPickedCountry} /></Suspense>
    </div>
  </IonContent></IonPage>;
}
