# Planner Domain COMMAND GUIDE

## Naming Conventions & Rules
- **plannerRequest**: The object containing user-input requirements, matching the ubiquitous language (e.g., date, startTime, anchorSchedules).
- **generateOptimizedItinerary**: The core function that communicates with the Gemini AI. 

## Architectural Principles
- **AI Prompts**: If you need to modify or tune the AI prompt (system prompt or criteria), you MUST ONLY modify `src/domains/planner/services/gemini-optimizer.js`.
- **Form UI**: The `travel-form.js` component ONLY collects data, handles debounce/loading states, and dispatches the customized data via an Event Bus or custom events.
- **Error Handling**: 429 Too Many Requests or other AI API errors are caught and thrown in `gemini-optimizer.js` and properly surfaced to the user in the main app lifecycle.
