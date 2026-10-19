import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStageTransition } from './screen-transition.js';
import { getAIPlaceRecommendations } from '../domains/planner/services/ai-place-recommendations.js';
import { t, getLang } from '../utils/i18n.js';
import { localTravelDate, travelRegion } from '../../functions/travel-region.mjs';
import { RECOMMENDATION_INTERESTS } from '../../functions/recommendation-interests.mjs';

export function AIPlaceRecommendations({city, draft, onAdd, onRemove}) {
  const location = useLocation();
  const lang = getLang();
  const today = localTravelDate(new Date(),travelRegion({destination:city}).timeZone);
  const [date,setDate] = useState(() => draft.date[0] >= today ? draft.date[0] : today);
  const [interest,setInterest] = useState('any');
  const [busy,setBusy] = useState(false);
  const [result,setResult] = useState(null);
  const [error,setError] = useState('');
  const version = useRef(0);
  const seenPlaces = useRef([]);
  const stage = useStageTransition(busy ? 'loading' : error ? 'error' : result ? 'results' : 'idle');
  useLayoutEffect(() => {
    version.current++;setBusy(false);setResult(null);setError('');
    seenPlaces.current = [];
  },[city.id,date,interest,lang,draft.theme,draft.budget]);
  useEffect(() => {
    version.current++;setBusy(false);
    return () => {version.current++;};
  },[location.key]);
  const request = async () => {
    if (busy || !date || date < today) return;
    const token = ++version.current;
    setBusy(true);setError('');setResult(null);
    try {
      const response = await getAIPlaceRecommendations({cityId:city.id,country:city.country,date,lang,theme:draft.theme,budget:draft.budget,interest,excludedPlaces:seenPlaces.current});
      if (version.current === token) {
        const seen = new Map(seenPlaces.current.map(place => [place.placeId,place]));
        for (const {place} of response.places) seen.set(place.placeId,{placeId:place.placeId,displayName:place.displayName});
        seenPlaces.current = [...seen.values()].slice(-20);
        setResult(response);
      }
    } catch (error) {
      if (version.current === token) setError(t(error.code === 'functions/resource-exhausted' ? 'aiPlacesLimit' : error.code === 'functions/failed-precondition' ? 'aiPlacesConfig' : error.code === 'functions/not-found' ? 'aiPlacesNoNew' : 'aiPlacesFailed'));
    } finally { if (version.current === token) setBusy(false); }
  };
  const suggestionsDocument = result?.searchSuggestions ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https:; base-uri 'none'; form-action 'none'">${result.searchSuggestions}` : '';
  return <section className="ai-place-recommendations" aria-labelledby={`ai-heading-${city.id}`}>
    <h2 id={`ai-heading-${city.id}`}>{t('aiPlacesTitle')}</h2>
    <p>{t('aiPlacesHelp')}</p>
    <fieldset className="ai-place-interests" aria-describedby={`ai-interest-help-${city.id}`}>
      <legend>{t('aiPlacesInterest')}</legend>
      <div className="ai-place-interest-options">{RECOMMENDATION_INTERESTS.map(value=><button type="button" key={value} aria-pressed={interest === value} onClick={()=>setInterest(value)}>{t(`aiPlacesInterest_${value}`)}</button>)}</div>
      <small id={`ai-interest-help-${city.id}`}>{t('aiPlacesInterestHelp')}</small>
    </fieldset>
    <div className="ai-place-controls">
      <label>{t('aiPlacesDate')}<input type="date" min={today} value={date} onChange={event=>setDate(event.target.value)} /></label>
      <button type="button" disabled={busy || !date || date < today} onClick={request}>{t(busy ? 'aiPlacesLoading' : result ? 'aiPlacesRefresh' : 'aiPlacesButton')}</button>
    </div>
    <small>{date === today ? t('aiPlacesToday') : t('aiPlacesVisitDate').replace('{0}',date)}</small>
    <div ref={stage} aria-busy={busy}>
      {busy && <p role="status">{t('aiPlacesLoadingHelp')}</p>}
      {error && <p role="alert">{error}</p>}
      {result && <>
        <p className="ai-place-weather">{t(result.weather?.status === 'forecast' ? 'aiPlacesForecast' : result.weather?.status === 'seasonal' ? 'aiPlacesSeasonal' : 'aiPlacesWeatherMissing')}
          {result.weather?.status === 'forecast' && <> · {result.weather.description}{Number.isFinite(result.weather.minC) && Number.isFinite(result.weather.maxC) && ` · ${result.weather.minC}–${result.weather.maxC}°C`}{Number.isFinite(result.weather.rainPercent) && ` · ${t('aiPlacesRain').replace('{0}',result.weather.rainPercent)}`}</>}</p>
        {result.places.map(item => {
          const selected = draft.anchorSchedules.some(anchor=>anchor.location?.placeId === item.place.placeId);
          return <article className="ai-place-card" key={item.place.placeId}>
            <div><h3>{item.place.displayName}</h3><small>{item.place.formattedAddress}</small><p className="ai-place-attribution" translate="no">Google Maps</p><p>{item.reason}</p>
              <p className="ai-place-hours">{t(`aiPlacesHours_${item.hours?.status || 'unknown'}`).replace('{0}',date)}{item.hours?.intervals?.length > 0 && <> · {item.hours.intervals.join(', ')}</>}</p>
              <div className="ai-place-sources">{item.sources.filter(source=>source.url !== item.mapsUrl).map(source=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>)}
                {item.mapsUrl && <a href={item.mapsUrl} target="_blank" rel="noopener noreferrer">{t('aiPlacesMap')}</a>}</div>
              {item.attributions?.map((attribution,index)=>attribution.url?<a key={index} href={attribution.url} target="_blank" rel="noopener noreferrer">{attribution.name}</a>:<small key={index}>{attribution.name}</small>)}
            </div>
            <button type="button" aria-pressed={selected} aria-label={`${t(selected ? 'flowRemovePlace' : 'flowAddPlace')}: ${item.place.displayName}`} onClick={()=>selected ? onRemove(item.place.placeId) : onAdd(item.place,`ai:${item.place.placeId}`)}>{selected?'✓':'+'}</button>
          </article>;
        })}
        {suggestionsDocument && <iframe title={t('aiPlacesSearchSources')} srcDoc={suggestionsDocument} sandbox="allow-popups allow-popups-to-escape-sandbox" className="ai-search-suggestions" />}
      </>}
    </div>
  </section>;
}
