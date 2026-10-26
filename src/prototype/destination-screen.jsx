import React, { useEffect, useRef, useState } from 'react';
import { useStageTransition } from './screen-transition.js';
import { IonContent, IonPage } from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { plannerDraftStore } from '../domains/planner/services/planner-draft.mjs';
import { destinations, destinationById } from '../domains/planner/services/travel-destinations.mjs';
import { bindPlaceSelection, normalizeSelectedPlace } from '../domains/planner/services/selected-place.mjs';
import { resolveDestinationPlace, destinationPlaceError } from '../domains/planner/services/destination-place.js';
import { getMapsLoader } from '../domains/map/services/google-maps-loader.js';
import { cityDestination, setDraftDestination } from '../domains/planner/services/course-draft.mjs';
import { t, tFor, getLang } from '../utils/i18n.js';
import { CountryPicker } from './country-picker.jsx';
import { travelRegion } from '../../functions/travel-region.mjs';
import { AIPlaceRecommendations } from './ai-place-recommendations.jsx';

export function DestinationScreen({ settings, browseCity, onBack, embedded = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const editingPlan = !embedded && location.state?.returnTo === '/plan';
  // A browsed city shows the draft as it would be for that city; it is stored only on an add or continuation.
  const read = () => browseCity ? setDraftDestination(plannerDraftStore.read(), cityDestination(browseCity)) : plannerDraftStore.read();
  const [draft, setDraft] = useState(read);
  const [country, setCountry] = useState(() => browseCity?.country || (draft.destinationStage === 'country' ? '' : draft.country || draft.destination?.country || ''));
  const [city, setCity] = useState(() => browseCity || (draft.destinationStage === 'city' || draft.destinationStage === 'country' ? null : destinationById(draft.destination?.id)));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const search = useRef(null);
  const version = useRef(0);
  const stageRef = useStageTransition(city?.id || country || 'country');
  const save = changes => setDraft(plannerDraftStore.save({ ...read(), step: '/destination', ...changes }));
  const selected = draft.anchorSchedules;
  useEffect(() => {
    version.current++;
    setBusy(false);
    if (browseCity) {
      if (location.pathname === '/recommend') setDraft(read());
      return;
    }
    if (location.pathname !== '/destination') return;
    const saved = plannerDraftStore.read();
    setDraft(saved);
    setCountry(saved.destinationStage === 'country' ? '' : saved.country || saved.destination?.country || '');
    setCity(['city', 'country'].includes(saved.destinationStage) ? null : destinationById(saved.destination?.id));
  }, [location.key, location.pathname, browseCity]);
  useEffect(() => {
    const element = search.current;
    if (!city || !element) return undefined;
    let active = true;
    void Promise.resolve().then(() => getMapsLoader().importLibrary('places')).then(() => {
      if (!active) return;
      bindPlaceSelection(element, () => {
        if (element.placeSelectionError) setError(t('flowPlaceFailed'));
      });
      element.includedRegionCodes = [travelRegion({ destination: { country } }).countryCode];
    }).catch(() => { if (active) setError(t('flowPlaceFailed')); });
    return () => { active = false; version.current++; };
  }, [city, country]);
  const add = (place, suggestionId = '') => {
    const canonical = normalizeSelectedPlace(place);
    if (!canonical) { setError(t('flowPlaceFailed')); return; }
    const anchors = read().anchorSchedules;
    if (anchors.some(anchor => anchor.location?.placeId === canonical.placeId)) {
      if (suggestionId) save({ anchorSchedules: anchors.map(anchor => anchor.location?.placeId === canonical.placeId ? { ...anchor, suggestionId } : anchor) });
      return;
    }
    save({ anchorSchedules: [...anchors, { name: canonical.displayName, location: canonical, suggestionId, day: 1, flexible: true, stayMinutes: 60, time: '', endTime: '' }] });
    setError('');
  };
  const addSuggestion = async place => {
    const request = ++version.current;
    setBusy(true); setError('');
    try {
      const found = await resolveDestinationPlace(city, place);
      if (request === version.current) add(found, place.id);
    } catch (error) {
      if (request === version.current) setError(destinationPlaceError(error));
    } finally {
      if (request === version.current) setBusy(false);
    }
  };
  const chooseCountry = code => { setCountry(code); setCity(null); version.current++; setBusy(false); save({ country: code, destinationStage: 'city' }); };
  const chooseCity = next => {
    const destination = cityDestination(next);
    save(editingPlan ? { country: next.country, destinationStage: 'places', destination } : setDraftDestination(read(), destination));
    version.current++; setBusy(false); setCity(next); setError('');
  };
  const back = () => {
    version.current++; setBusy(false);
    if (onBack) { onBack(); return; }
    if (city) { setCity(null); save({ destinationStage: 'city' }); }
    else if (country) { setCountry(''); save({ destinationStage: 'country' }); }
    else navigate(editingPlan ? '/plan' : '/home');
  };
  const content = <>
    {!embedded && <div className="ionic-page-nav"><button onClick={back}>← {t('shellBack')}</button>{settings}</div>}
    <main ref={stageRef} className="flow-page">
      <h1>{t(city ? 'flowPlaces' : country ? 'flowCity' : 'flowCountry')}</h1>
      {!country && <CountryPicker kind="destination" onSelect={chooseCountry} />}
      {country && !city && <div className="flow-choices country-grid city-grid">{destinations.filter(city => city.country === country).map(city => <button key={city.id} onClick={() => chooseCity(city)}>{t(city.key)}</button>)}</div>}
      {city && <>
        <p>{t(city.key)} · {t(`country${country}`)}</p>
        <label htmlFor="destination-search">{t('flowSearch')}</label>
        <gmp-place-autocomplete id="destination-search" ref={search} />
        <p>{t('flowSearchHelp')}</p>
        <button onClick={async () => { await search.current?.placeSelectionPending; add(search.current?.selectedPlace); }}>{t('flowAddPlace')}</button>
        {error && <p role="alert">{error}</p>}
        <AIPlaceRecommendations key={city.id} city={city} draft={draft} onAdd={add} onRemove={placeId=>save({anchorSchedules:read().anchorSchedules.filter(anchor=>anchor.location?.placeId !== placeId)})} />
        <details className="catalogue-places" open><summary>{t('aiPlacesCatalogue').replace('{0}',t(city.key))}</summary>
        <div className="flow-place-list">{city.places.filter(place => !place.pairOnly).map(place => {
          const name = typeof place === 'string' ? place : place.name ? (getLang() === 'en' ? place.englishName : place.name) : t(`${place.key}Name`);
          const canonicalName = typeof place === 'string' ? place : place.englishName || tFor(`${place.key}Name`, 'ko');
          const chosen = selected.find(anchor => anchor.suggestionId === (typeof place === 'string' ? place : place.id) || anchor.location?.displayName === canonicalName);
          return <div className="flow-place-row" key={typeof place === 'string' ? place : place.id}>
            <details><summary>{name}<small>{t(city.key)}</small></summary><p>{typeof place === 'string' ? name : place.name ? place.location : t(`${place.key}Description`)}</p>{typeof place !== 'string' && place.guide && <a href={place.guide} target="_blank" rel="noopener noreferrer">{t('courseVisitorSourceLink')}</a>}</details>
            <button disabled={busy} aria-pressed={!!chosen} aria-label={t(chosen ? 'flowRemovePlace' : 'flowAddPlace') + ': ' + name} onClick={() => chosen ? save({ anchorSchedules: selected.filter(anchor => anchor !== chosen) }) : addSuggestion(place)}>{chosen ? '✓' : '+'}</button>
          </div>;
        })}</div></details>
        {selected.map((anchor, index) => <button className="flow-place-chip" key={index} onClick={() => save({ anchorSchedules: selected.filter((_, i) => i !== index) })}>{anchor.name} ×</button>)}
        <button className="flow-primary" disabled={busy} onClick={() => { const next = editingPlan ? '/plan' : '/preference/1'; save({ step: next }); navigate(next); }}>{selected.length ? t('flowNextPlaces').replace('{0}', selected.length) : t('flowSkipPlaces')}</button>
      </>}
    </main>
  </>;
  return embedded ? content : <IonPage><IonContent className="ion-padding shell-content">{content}</IonContent></IonPage>;
}
