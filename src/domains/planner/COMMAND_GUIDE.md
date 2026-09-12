# Planner Domain COMMAND GUIDE

## Naming Conventions & Rules
- **plannerRequest**: The object containing user-input requirements, matching the ubiquitous language (e.g., date, startTime, anchorSchedules).
- **dailyData**: The canonical per-day constraint array derived from `plannerRequest`; each item contains day/date, start/end time, start/end location, and anchors.
- **normalizePlannerRequest**: Converts current flat form data and legacy per-day data into the canonical `dailyData` contract.
- **enforcePlannerConstraints**: Reconciles probabilistic AI output with authoritative user constraints before rendering or saving.
- **generateOptimizedItinerary**: The core function that communicates with the Gemini AI. 

## Architectural Principles
- **AI Prompts**: If you need to modify or tune the AI prompt (system prompt or criteria), you MUST ONLY modify `src/domains/planner/services/gemini-optimizer.js`.
- **Hard Constraints**: Departure, destination, day boundary times, and anchors MUST NOT rely solely on prompt compliance. Keep deterministic normalization/enforcement in `planner-constraints.mjs`.
- **Form UI**: The `travel-form.js` component ONLY collects data, handles debounce/loading states, and dispatches the customized data via an Event Bus or custom events.
- **Error Handling**: 429 Too Many Requests or other AI API errors are caught and thrown in `gemini-optimizer.js` and properly surfaced to the user in the main app lifecycle.
- **Tests**: Any planner contract change MUST update `test/planner-constraints.test.mjs` and pass `npm test` plus `npm run build`.

## Input Draft

- `services/planner-draft.mjs` owns the editable flat input shared by preference selection, form restoration, and editing a saved itinerary. `currentFormData` is its per-tab recovery copy; `userPreference` is only a compatibility projection for route guards.
- Editing a saved itinerary replaces the whole input draft before navigation. Displayed dates, preference badges, anchor day options, daily-time inputs, and submitted data must use that same draft. `travel-form-data.js` receives it explicitly and must not reread session storage.
- Preference controls update the draft only on explicit user changes, not while reconstructing controls. Re-entering the preference page restores the current draft; skipping clears theme and budget, including explicit null values.
- Keep only editable fields in the draft. Saved derived `dailyData` must be rebuilt by `normalizePlannerRequest` after editing, so it cannot resurrect old dates, times, or deleted anchors.
- Form reset clears detailed inputs while preserving the selected dates/theme/budget. The cleared draft must also survive reload.

## Generation Lifecycle

- `app/generation-controller.mjs` owns the active generation attempt, success/failure transitions, and result/navigation guards. `app/main.js` wires the form event, auth/route context, result application, and completion notification into it.
- Call `syncContext()` on route/auth reevaluation. Leaving `/plan` or changing accounts invalidates the local attempt immediately; returning to `/plan` does not revive it. This does not cancel the server request.
- Only the current attempt may apply its result, change the progress screen, or release the form's submit button via `itinerary-generation-complete`. A superseded request's completion must not stop a newer request's timers.
- `enterPlan()` restores the form when idle but preserves the current loading/success/failure screen on same-account, same-route reevaluation. Successful generation still waits for the user to choose the result button before navigating.
- `ui/generation-progress.js` owns loading/result/error markup updates and advertisement/message animation resources. Every stop clears intervals, delayed transitions, and animation frames; version checks also ignore callbacks already queued before cancellation.
- Keep generation request/response constraints and fallback behavior in the existing planner services. Lifecycle and presentation changes are covered by `generation-controller.test.mjs` and `generation-progress.test.mjs`.
