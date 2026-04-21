# Schema Definition

## Anchor Event Interface
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "title": { "type": "string" },
    "startTime": { "type": "string", "description": "HH:MM" },
    "endTime": { "type": "string", "description": "HH:MM" },
    "location": { "lat": "number", "lng": "number", "address": "string" },
    "isFixed": { "type": "boolean", "const": true, "description": "임의로 변경/이동 불가능한 고정 일정 판단의 필수 값" }
  },
  "required": ["id", "title", "startTime", "endTime", "location", "isFixed"]
}
```

## Generated Itinerary Payload
```json
{
  "type": "object",
  "properties": {
    "segments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string", "enum": ["ANCHOR", "GENERATED", "TRANSIT"] },
          "startTime": { "type": "string" },
          "endTime": { "type": "string" },
          "place": { "type": "string" },
          "details": { "type": "string" },
          "estimatedCost": { "type": "string" },
          "operatingHours": { "type": "string" },
          "localTip": { "type": "string" },
          "top3Recommendations": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "rating": { "type": "number" },
                "reviewUrl": { "type": "string" },
                "directionUrl": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
}
```
