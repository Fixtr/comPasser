import React, { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { plannerDraftStore } from '../domains/planner/services/planner-draft.mjs';
import { searchCities } from '../domains/planner/services/city-search.mjs';
import { t } from '../utils/i18n.js';

// The world map data and d3 are about 50 KB gzip; home paints its text first and the globe follows.
const TravelGlobe = lazy(() => import('./travel-globe.jsx').then(module => ({ default: module.TravelGlobe })));

export function HomeScreen({ pageActive, user, authSettled, settings }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Ionic keeps the '/' and '/home' pages mounted together; only the shown one may run home's effects and globe.
  const active = pageActive;
  const [importStatus, setImportStatus] = useState('');
  const [pickedCountry, setPickedCountry] = useState(null);
  const [pickedCity, setPickedCity] = useState(null);
  const [query, setQuery] = useState('');
  // null until the search is first used, false when the download failed.
  const [catalogue, setCatalogue] = useState(null);
  const searchId = useId();
  const results = useRef(null);
  const tripOwner = authSettled && user?.uid;
  const matches = catalogue ? searchCities(query, catalogue.destinations, city => t(city.key)) : [];
  const noMatch = Boolean(catalogue && query.trim() && !matches.length);

  // The city catalogue stays out of the first load; it arrives when the search is first used.
  const loadCatalogue = () => {
    if (catalogue) return;
    Promise.all([import('../domains/planner/services/travel-destinations.mjs'), import('../domains/planner/services/course-draft.mjs')])
      .then(([{ destinations }, { cityDestination, setDraftDestination }]) => setCatalogue({ destinations, cityDestination, setDraftDestination }))
      .catch(error => { console.error('City search unavailable:', error); setCatalogue(false); });
  };
  const searchKey = event => {
    // Enter that only finishes a Korean syllable is not a choice (229: Safari reports it after composition ends).
    if (event.nativeEvent.isComposing || event.keyCode === 229 || !matches.length) return;
    if (event.key === 'Enter' && matches.length === 1) setPickedCity(matches[0]);
    else if (event.key === 'Enter' || event.key === 'ArrowDown') { event.preventDefault(); results.current?.querySelector('button')?.focus(); }
  };

  // Only signed-in users have saved trips; guests never load the card or its Firestore code.
  useEffect(() => {
    if (tripOwner) void import('../domains/itinerary/ui/upcoming-trip.js').catch(error => console.error('Upcoming trip card unavailable:', error));
  }, [tripOwner]);

  // The saved draft is restored when auth settles; saving a pick earlier would overwrite it.
  useEffect(() => {
    if (!pickedCountry && !pickedCity) return;
    if (!active) { setPickedCountry(null); setPickedCity(null); return; }
    if (!authSettled) return;
    setPickedCountry(null); setPickedCity(null); setQuery('');
    // A searched city is saved the way the city step's chooseCity saves it, and opens the places step.
    if (pickedCity) plannerDraftStore.save({ ...catalogue.setDraftDestination(plannerDraftStore.read(), catalogue.cityDestination(pickedCity)), step: '/destination' });
    else plannerDraftStore.update({ country: pickedCountry, destinationStage: 'city', step: '/destination' });
    navigate('/destination');
  }, [pickedCountry, pickedCity, catalogue, active, authSettled, navigate]);

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
    {(pickedCountry || pickedCity) && <p role="status">{t('loadingModal')}</p>}
    <div className="ionic-home-settings">{settings}</div>
    <div className="ionic-home">
      <div className="ionic-home-intro">
        <span className="shell-kicker">ComPasser</span>
        <h1>{t('flowHomeTitle')}</h1>
        <p>{t('flowHomeDescription')}</p>
      </div>
      {/* Mounted only while this page shows, so coming back re-reads the list once. */}
      {tripOwner && active && <upcoming-trip key={tripOwner} uid={tripOwner} />}
      {/* Above the globe so the two entries stay above the tab bar on short phones. */}
      <nav className="ionic-home-links"><button onClick={() => navigate('/recommend')}>{t('shellRecommend')}</button><button onClick={() => navigate('/courses')}>{t('shellCourses')}</button></nav>
      {/* Below the entries: results grow downwards and never push the two buttons under the tab bar. */}
      <div className="ionic-home-search">
        <label htmlFor={searchId}>{t('homeCitySearch')}</label>
        <input id={searchId} type="search" autoComplete="off" enterKeyHint="search" value={query} onFocus={loadCatalogue} onChange={event => { loadCatalogue(); setQuery(event.target.value); }} onKeyDown={searchKey} />
        {matches.length > 0 && <ul role="list" className="ionic-home-results" ref={results} aria-label={t('homeCitySearch')}>{matches.map(city => <li key={city.id}><button type="button" onClick={() => setPickedCity(city)}>{t(city.key)} · {t(`country${city.country}`)}</button></li>)}</ul>}
        {/* Always mounted so screen readers announce the text when it appears. */}
        <p role="status">{noMatch && t('homeCityNoMatch')}</p>
        {(noMatch || catalogue === false) && <button type="button" onClick={() => navigate('/recommend')}>{t('homeCityBrowseAll')}</button>}
      </div>
      <Suspense fallback={<section className="travel-globe"><div className="globe-stage" /><h2>{t('flowDiscoverTitle')}</h2><p>{t('flowDiscoverDescription')}</p></section>}><TravelGlobe active={active} onChooseCity={setPickedCountry} /></Suspense>
    </div>
  </IonContent></IonPage>;
}
