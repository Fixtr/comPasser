import React, { lazy, Suspense, useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { plannerDraftStore } from '../domains/planner/services/planner-draft.mjs';
import { t } from '../utils/i18n.js';
import { curatedRoute, PUBLIC_ROUTE_ID } from '../domains/itinerary/services/public-route.mjs';
import { addCourseToDraft, cityDestination } from '../domains/planner/services/course-draft.mjs';
import { destinations } from '../domains/planner/services/travel-destinations.mjs';
import { courseCity } from '../domains/itinerary/services/course-community.mjs';

// The world map data and d3 are about 50 KB gzip; home paints its text first and the globe follows.
const TravelGlobe = lazy(() => import('./travel-globe.jsx').then(module => ({ default: module.TravelGlobe })));

export function HomeScreen({ authSettled, settings }) {
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
    setImportStatus('publicRouteImporting');
    // The saved draft is restored when auth settles; importing earlier would overwrite it in a new tab.
    if (!authSettled) return;
    let cancelled = false;
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
  }, [active, authSettled, location.search, navigate]);

  return <IonPage><IonContent className="ion-padding shell-content">
    {importStatus && <p role="status">{t(importStatus)}</p>}
    <div className="ionic-home-settings">{settings}</div>
    <div className="ionic-home">
      <div className="ionic-home-intro">
        <span className="shell-kicker">ComPasser</span>
        <h1>{t('flowHomeTitle')}</h1>
        <p>{t('flowHomeDescription')}</p>
      </div>
      <Suspense fallback={<section className="travel-globe"><div className="globe-stage" /><h2>{t('flowDiscoverTitle')}</h2><p>{t('flowDiscoverDescription')}</p></section>}><TravelGlobe active={active} onChooseCity={country => {
        plannerDraftStore.update({ country, destinationStage: 'city', step: '/destination' });
        navigate('/destination');
      }} /></Suspense>
      <nav className="ionic-home-links"><button onClick={() => navigate('/recommend')}>{t('shellRecommend')}</button><button onClick={() => navigate('/courses')}>{t('shellCourses')}</button></nav>
    </div>
  </IonContent></IonPage>;
}
