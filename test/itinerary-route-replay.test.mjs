import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fitMeasuredSchedule } from '../src/domains/itinerary/services/itinerary-end-fit.mjs';
import { minutesOf } from '../src/domains/itinerary/services/itinerary-schedule-adjust.mjs';

test('recorded Places and Directions rounds reproduce final route fitting decisions', () => {
  for (const date of ['2026-09-29', '2026-09-30']) {
    const folder = new URL(`../docs/evaluations/${date}-feasible-maps/`, import.meta.url);
    const files = readdirSync(folder).filter(name => name.endsWith('.capture.json'));
    assert.equal(files.length, 6);
    for (const file of files) {
      const record = JSON.parse(readFileSync(new URL(file, folder)));
      for (const day of record.mapsSnapshot.days) {
        const constraint = record.request.dailyData.find(entry => entry.day === day.day);
        // Captured before the arrival kept the requested end time: an early recorded arrival now reads as the end.
        const keepEnd = list => list.map((item, i) => i === list.length - 1 && item.type === 'arrival'
          && minutesOf(item.time) < minutesOf(constraint.endTime) ? { ...item, time: constraint.endTime } : item);
        for (const [index, round] of day.rounds.entries()) {
          if (index >= 4) break; // the fifth round only verifies new neighboring routes
          const items = keepEnd(structuredClone(round.scheduleItems));
          const unresolved = items.filter(item => item.placeStatus === 'unresolved');
          assert.equal(unresolved.length, round.diagnostics.length);
          for (const [itemIndex, item] of unresolved.entries()) item.unresolvedReason = round.diagnostics[itemIndex].reason;
          const fit = fitMeasuredSchedule(items, round.transitRoutes, constraint.endTime, constraint.startTime);
          assert.equal(fit.adjusted, round.adjusted, `${record.case} day ${day.day} round ${index}`);
          if (fit.adjusted) {
            const next = day.rounds[index + 1]?.scheduleItems;
            assert.ok(next, `${record.case} missing route recheck`);
            assert.deepEqual(fit.items.map(item => [item.type, item.time, item.endTime]),
              keepEnd(next).map(item => [item.type, item.time, item.endTime]), `${record.case} day ${day.day} round ${index}`);
          }
        }
      }
    }
  }
});
