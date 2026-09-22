# Schema Definition

## Planner Request (Form Contract)
```json
{
  "date": ["2026-06-29"],
  "startTime": "09:00",
  "endTime": "21:00",
  "startLocation": "호텔 또는 출발 장소",
  "endLocation": "공항 또는 도착 장소",
  "dailyTimes": [{ "day": 1, "startTime": "09:00", "endTime": "21:00", "isCustom": false }],
  "anchorSchedules": [{
    "day": 1,
    "name": "필수 일정 이름",
    "time": "11:00",
    "endTime": "14:00",
    "location": "필수 일정 장소"
  }],
  "theme": "healing",
  "budget": "standard"
}
```

`startLocation`, `endLocation`, and anchor `location` accept either a plain string or a structured Google Place object. The form contract remains flat for edit/save compatibility.

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

## Recommendation place resolution (2026-09-15)

For source-linked sharing/deletion behavior introduced on 2026-09-18, see [shared deletion](SHARED_DELETION_2026-09-18.md).

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
fall back to the model's address: it leaves an explicit unresolved card and no
navigation links/coordinate. Unknown intermediate stops are not bridged by a
direct route. Legacy recommendations without `placeIntent` retain the previous
strict named-place matching behavior; they are not silently replaced.
