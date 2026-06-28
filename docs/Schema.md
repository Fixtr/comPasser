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
