# Schema Definition

## Planner Request (Form Contract)
```json
{
  "date": ["2026-06-29"],
  "startTime": "09:00",
  "endTime": "21:00",
  "startLocation": "호텔 또는 출발 장소",
  "endLocation": "공항 또는 도착 장소",
  "selectedWaypoints": [{ "name": "방문할 곳 이름", "location": "방문할 곳 주소" }],
  "dailyTimes": [{ "day": 1, "startTime": "09:00", "endTime": "21:00", "isCustom": false }],
  "anchorSchedules": [{
    "day": 1,
    "name": "필수 일정 이름",
    "time": "11:00",
    "endTime": "14:00",
    "location": "필수 일정 장소"
  }],
  "theme": "healing",
  "budget": "standard",
  "flights": {
    "arrival": { "airport": "인천국제공항", "time": "10:00", "kind": "international" },
    "departure": null
  }
}
```

`startLocation`, `endLocation`, and anchor `location` accept either a plain string or a structured Google Place object. The form contract remains flat for edit/save compatibility.
`flights` is optional. An arriving flight sets day 1 `startLocation` to its airport and the start time to landing + 60 minutes (`international`) or + 30 minutes (`domestic`). A departing flight sets the last day `endLocation` to its airport and the end time to 3 hours or 90 minutes before departure. The form locks those locations while a flight exists; times stay editable. The server ignores `flights` and uses the resulting locations and times.
`selectedWaypoints` is retained for drafts created by the earlier home-card flow. Current home picks are added to `anchorSchedules` on day 1 with blank `time` and `endTime`; the user sets both in the form before generation. Existing departure and destination fields are unchanged.

## Canonical Daily Constraint

`normalizePlannerRequest()` derives this internal contract before prompt construction:

```json
{
  "day": 1,
  "date": "2026-06-29",
  "startTime": "09:00",
  "endTime": "21:00",
  "startLocation": "호텔 또는 출발 장소",
  "endLocation": "공항 또는 도착 장소",
  "anchors": [{
    "day": 1,
    "name": "필수 일정 이름",
    "time": "11:00",
    "endTime": "14:00",
    "location": "필수 일정 장소"
  }]
}
```

## Generated Itinerary Payload
```json
{
  "type": "object",
  "properties": {
    "days": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "day": { "type": "integer" },
          "date": { "type": "string" },
          "theme": { "type": "string" },
          "scheduleItems": { "type": "array" }
        }
      }
    }
  }
}
```

Each `scheduleItems` entry contains `time`, `endTime`, `type`, `title`, `description`, `location`, `duration`, map URLs, `transitInfo`, and `practicalInfo`. After generation, `enforcePlannerConstraints()` guarantees:

- first item location/time = selected departure/start time;
- last item location/time = selected destination/end time;
- every Anchor exists with its original day, time range, title, and location.

As of 2026-09-29, the model generates **optional visits only**: `type` is an enum
of `attraction`, `dining`, `leisure`. Every requested day/date is required, but its
`scheduleItems` may be empty when no visit fits. The app inserts departure,
arrival and fixed anchors from the original request. Existing stored plans with
those types remain valid and are not migrated. `placeIntent.purpose` is nonempty
for all newly generated visits; `nearLocation` and `location` copy one of the
day's allowed fixed place names. Addresses remain input context, not search-center names.

Meal times are preferences conditional on the available day and appointments.
Optional restaurant meals require 60 minutes; cafes and other visits require
20 minutes. Automatic fitting never reduces a meal below 60 minutes; if it cannot
fit, it preserves the conflict warning. Explicit manual trimming may remove a
visit under its existing behavior, but does not leave a meal shorter than 60 minutes.
Existing user-entered short visits are not silently lengthened. All budgets use
the app's public-transit routing; budget preferences apply to venue spending.

## Recommendation place resolution (2026-09-15)

For source-linked sharing/deletion behavior introduced on 2026-09-18, see [shared deletion](history/SHARED_DELETION_2026-09-18.md).

New AI responses include `placeIntent: { purpose, category, nearLocation }` on each item.
Ordinary items describe an activity goal, not a business identity. Categories are
`restaurant`, `cafe`, `park`, `museum`, `tourist_attraction`, `shopping_mall`.
`nearLocation` is an exact hint to a user-specified fixed place; it is not used as
an arbitrary geocoding address. Fixed user items use an empty purpose and are
still reconciled against the original request.

The generation boundary strips model-supplied `selectedPlace`, `verifiedPlace`,
coordinates and resolved names. User selections are restored by constraint
enforcement. Valid ordinary intents start with `placeStatus: "pending"`; invalid
intents start unresolved and cannot trigger an address-only lookup.

Google Places text search supplies actual candidates. The client checks country
KR, category, valid ID/name/address/coordinates, known closure status, duplicate
IDs and a 5 km straight-line radius around the chosen fixed location. The nearest
remaining candidate is adopted. This is a proximity rule, not proof of travel time,
opening hours, budget fit, accessibility, or availability.

Verified items carry JSON-only `verifiedPlace` fields:
`{ placeId, displayName, formattedAddress, lat, lng, source: "google_places",
category, intentKey, centerPlaceId }` and `placeStatus: "verified"`.
Canonical title/address, literal coordinates and a Place-ID-based Maps link are
propagated through `places-resolved` → itinerary state → save/share snapshots.
The model's invented hours, tips, ratings, website and route text are removed.
`placeIntent` remains on the item so activity purpose and lookup provenance survive.

Reload reuses a valid verified identity only when intent, fixed-center ID and
distance still match. No-match, invalid intent, timeout or API error does not
fall back to the model's address. In an editable generated draft, automatic
route fitting removes optional visits only when Places returned no candidates
or all candidates were filtered. API errors, timeouts and user-added stops stay
unresolved for retry. Saved/shared snapshots retain unresolved cards. Unknown
intermediate stops are not bridged by a direct route. Legacy recommendations
without `placeIntent` retain strict named-place matching behavior.
