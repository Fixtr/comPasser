import { t } from '../../../utils/i18n.js';
import { getLocationName } from './location-name.mjs';

const joined = values => values.map(getLocationName).filter(Boolean).join(' · ');

/**
 * One short value per group of the plan details form, read from the saved draft (same wording as the
 * review step). An optional group with nothing in it is ''; places is a list of lines.
 */
export function planGroupSummaries(draft) {
  const place = value => getLocationName(value) || t('locationUnset');
  const time = value => value || t('timeUnset');
  const perDay = ` · ${t('planGroupPerDay')}`;
  const anchors = draft.anchorSchedules || [];
  const automatic = anchors.filter(anchor => anchor.flexible).length;
  return {
    time: draft.dailyTimes?.some(day => day.isCustom) ? t('planGroupPerDay') : `${time(draft.startTime)} – ${time(draft.endTime)}`,
    endpoints: `${place(draft.startLocation)} → ${place(draft.endLocation)}`
      + (draft.dailyLocations?.some(day => getLocationName(day.startLocation) || getLocationName(day.endLocation)) ? perDay : ''),
    stays: joined(Array.isArray(draft.stays) ? draft.stays.map(stay => stay.location) : draft.overnightLocations || []),
    flights: ['arrival', 'departure'].filter(kind => draft.flights?.[kind])
      .map(kind => `${t(`${kind}Flight`)} ${time(draft.flights[kind].time)}`).join(' · '),
    places: [
      ...anchors.filter(anchor => !anchor.flexible)
        .map(anchor => `${t('day_n').replace('{0}', anchor.day)} · ${time(anchor.time)} – ${time(anchor.endTime)} · ${anchor.name}`),
      ...(automatic ? [t('planGroupAuto').replace('{0}', automatic)] : []),
    ],
  };
}
