# Itinerary Domain COMMAND GUIDE

## Naming Conventions
- **ScheduleItem**: Represents an individual event or activity in the itinerary (replaces 'event').
- **AnchorSchedule**: A fixed, mandatory schedule item that acts as a pivot for the rest of the plan.
- **TransitRoute**: Represents the route and transportation details between two `ScheduleItem`s.
- **ItineraryPlan**: The complete travel plan containing multiple days and `ScheduleItem`s.

## UI Rendering Principles
- All itinerary-specific UI logic (like timeline rendering) must be encapsulated within `src/domains/itinerary/ui/`.
- The `itinerary-view.js` component is responsible for orchestrating the timeline.
- CSS classes should use the ubiquitous language (e.g., `schedule-card` instead of `event-card`).
- The component receives an `ItineraryPlan` and renders the list of `ScheduleItem`s, intertwining them with `TransitRoute` events.
