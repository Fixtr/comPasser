import { readFileSync } from 'node:fs';

/** Every file the itinerary view is split into. A chunk that moves out adds one line here. */
export const ITINERARY_VIEW_FILES = [
  'src/domains/itinerary/ui/itinerary-view.js',
  'src/domains/itinerary/ui/itinerary-schedule-card.js',
  'src/domains/itinerary/ui/itinerary-share-save.js',
  'src/domains/itinerary/ui/itinerary-loading.js',
  'src/domains/itinerary/ui/itinerary-editing.js',
  'src/domains/itinerary/ui/itinerary-notices.js',
  'src/domains/itinerary/ui/itinerary-day-render.js',
  'src/domains/itinerary/ui/itinerary-transit-adjust.js',
  'src/domains/itinerary/ui/departure-card.js',
];

export const readItineraryViewSource = () => ITINERARY_VIEW_FILES
  .map(file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')).join('\n');

/** For tests that run the view through new Function: imports and export keywords removed. */
export const runnableItineraryViewSource = () => readItineraryViewSource()
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace(/^export (?=(?:async )?function )/gm, '')
  .replace('export default class', 'class');
