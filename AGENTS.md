# Repository Guidelines

## Project Structure & Module Organization
ComPasser is an AI travel planner built with Vanilla JavaScript, Vite, Firebase, and Capacitor. `src/app/` handles application startup and routing. Feature code lives in `src/domains/{auth,planner,itinerary,map,profile}/`, split into `services/` and `ui/`. Shared helpers, icons, and design tokens live in `src/utils/`, `src/ui/`, and `src/styles/`. Static assets and the service worker live in `public/`; backend code lives in `functions/`. Native projects are in `android/` and `ios/`. Read the relevant domain’s `COMMAND_GUIDE.md` before changing its behavior.

## Build, Test, and Development Commands
Use Node.js 24 and Java JDK 21 or newer for the complete test suite.

- `npm ci` and `npm ci --prefix functions`: install locked frontend and backend dependencies.
- `npm run dev`: start the Vite development server.
- `npm run build`: produce the production bundle in `dist/`.
- `npm run preview`: serve the production build locally.
- `npm test`: run Node.js unit and contract tests.
- `npm run lint`: run Oxlint with the anti-slop rules over `src`, `functions`, `scripts`, and `test`.
- `npm run test:browser:install`: install the test browser before first use.
- `npm run test:browser`: run Playwright smoke scenarios.
- `npm run test:emulator`: run Firebase Auth/Firestore integration and security-rule tests.
- `npm run check`: run tests, build, browser scenarios, and emulator tests sequentially.
- `npm run cap:sync`: build and synchronize the native projects.

## Coding Style & Naming Conventions
Follow surrounding code: two-space indentation, semicolons, and predominantly single-quoted JavaScript strings. Use kebab-case filenames, camelCase functions and variables, and PascalCase component classes. Keep business logic in services and rendering in UI modules. Reuse `src/utils/i18n.js` for translated text and existing design tokens for styling. Lint with Oxlint (`npm run lint`, config in `.oxlintrc.json`), including the vendored anti-slop rules in `tools/oxlint/anti-slop/`. No formatter is configured; avoid unrelated formatting changes.

## UI Screen Transitions

- All Ionic routes, including tabs, forward/back navigation and cached pages, use `src/prototype/screen-transition.js` via the shell's captured Ionic lifecycle events and outlet page-visibility observer. Keep `IonRouterOutlet animated={false}` to avoid double/platform-dependent animations; do not add per-page route animations.
- New or changed in-page steps (country → city → places/courses, form → progress/error, review, etc.) must reuse `useStageTransition(stage)` (React) or `animateScreen(element, true)` from `src/ui/screen-motion.js` (custom elements) on the content container. Use a stable semantic stage key, not input values, loading responses or language changes. Keep the router-managed `IonPage`/`IonContent` and form/custom-element identity stable; never remount the page just to replay animation.
- Use the shared 220ms motion policy and respect `prefers-reduced-motion`, including changes while the app is open. Preserve focus, scroll, input drafts and click/keyboard access; never animate layout dimensions or delay navigation/data writes.
- Focus: when a route or step change drops the user's focus (the button they used was removed or hidden with the old page), `focusHeading` moves it to the new content's first visible `h1`/`h2`, including one shadow root down. A field, dialog or tab bar button that keeps focus is left alone; an open Ionic sheet from the old page is waited out (it traps focus until it unmounts); and before any user activation (first page, deep-link redirects) the browser's starting focus is kept. Each route sets `document.title` from the shell's `pages` table, with the picked city on `/recommend` and `/courses`.
- Add browser coverage for new transitions, cached return/back behavior and reduced motion. Future sessions must follow this policy when adding screens or navigation.

## Testing Guidelines
Use Node’s built-in test runner for `test/*.test.mjs`, Playwright for `test/browser/`, and local Firebase emulators for `test/emulator/`. Add regression coverage for behavior changes; register new browser callbacks in `test/browser/smoke.spec.mjs`. No numeric coverage threshold is configured. Run `npm run check` before requesting review. See `docs/TESTING.md` for setup, isolation, and failure artifacts.

## Commit & Pull Request Guidelines
Recent commits use `fix:`, `refactor:`, and `docs:` prefixes with concise imperative descriptions. Follow that pattern. Some historical commits contain deployment/CI skip markers; use them only intentionally. PRs should describe the problem, resulting behavior, related issues, and validation performed. Include screenshots for UI changes and identify any untested native or production integrations.

## Security & Configuration
Never commit `.env` files, credentials, or Android signing keys. Keep automated tests isolated from production Firebase; use the provided emulator runner and configuration.
