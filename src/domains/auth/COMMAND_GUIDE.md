# Auth Domain COMMAND GUIDE

## Architectural Principles
- **Firebase Auth Centralization**: Any interaction with Firebase Authentication (e.g. `signInWithPopup`, `signOut`, `onAuthStateChanged`) must go through `src/domains/auth/services/firebase-auth.js`. Do not import `firebase/auth` directly in UI components.
- **Login View Limitation**: The `login-view.js` component acts solely as the landing page UI for unauthenticated users.
- **Routing**: Routing based on authentication state is handled by the Ionic shell (`src/prototype/ionic-shell.jsx`), which listens to `subscribeToAuthChanges` and passes the user to `decideRoute` (`src/app/route-decision.mjs`); `/login` and `/join` mount `login-view` and `join-view` inside `AuthScreen`.
- **Environment Variables**: Make sure to populate the `.env` file with the relevant `VITE_FIREBASE_*` keys for authentication to work correctly.

## Guest Sign-in Context

- The Ionic `/login` and `/join` (`AuthScreen`) show one reason line chosen by `next`: a planning return (`/preference/1`, `/preference/2`, `/plan`) names only what the guest draft holds (the city and the number of picked places, or the city alone, or a generic line when the draft has no city); a `/profile...` return says trips and profile need an account; a plain visit shows nothing.
- An email account that is not verified yet never owns the planner draft: the shell keeps the guest owner for it and signs it out with `logout({ keepLocalData: true })`, so signing up by email keeps the guest's picks. Every other `logout()` call still clears local travel data.
- Signup and login link to the privacy policy at its public address (`PRIVACY_POLICY_URL`, `https://hackerton-48w.pages.dev/privacy`) in a new tab, because a bare `/privacy` falls back to `index.html` inside the native app. The policy is Korean only, so the English link says so. `public/sw.js` leaves `/privacy` to the network, so offline the browser shows its own error instead of the app's not-found page.

## Form Accessibility

- `/login` and `/join` lead with an `h1`, and each email or password field has a visible `<label>` (the `emailPlaceholder` / `passwordPlaceholder` strings) instead of a placeholder, so the field keeps its name while the user types. The fields are `required` inside a `<form novalidate>`: Enter or the phone's Go key submits, screen readers say the field is required, and the app's own messages (`emailPasswordRequired`, `pwTooShort`) still replace the browser's bubbles.
- Email login and signup run on the form's `submit` event, never on the button's `click`: with both, one click would run the handler and also submit the form natively. Social buttons, the forgot-password link and the join/login links sit outside the form; join's eye toggle is `type="button"`.
- The Naver button keeps white on #03C75A (2.25:1). `src/styles/tokens.css` pins provider colours to each brand guide; changing it is the owner's call.

## Password Reset

- Firebase's email action URL is project-wide and points at this app's `/verify` (checked 2026-10-27: `https://hackerton-48w.pages.dev/verify`), so verification **and** reset links land there. `verify-view.js` branches on `mode=resetPassword` (new password → `resetPassword`); every other mode still goes to `verifyEmailCode`. Moving the site to another domain means updating that URL in the Firebase console.
- The login screen sends the reset mail to the typed address and answers the same way whether or not an account exists (`auth/user-not-found` is shown as sent). Email login and reset both use the JS SDK, so they work the same in the Capacitor WebView; the mailed link opens in the phone's browser.

## Account Deletion Preflight

- `firebase-auth.js` composes `account-deletion-guard.mjs` with `getIdTokenResult(user, true)`. A refreshed token is not a fresh sign-in: check `authTime`, never `issuedAtTime` or a local "logged in" flag. The guard does not itself reauthenticate a user.
- The app requires sign-in within **60 seconds** before starting deletion. This is a conservative app policy, not a statement about Firebase's internal recent-login threshold. Missing/invalid/future authentication times and token-fetch failures stop before deletion.
- `/account-deletion-status` is a public read-only page for receipts saved in this browser. It never starts or resumes deletion and must remain reachable after Auth is removed.
- Older sessions go through the existing sign-out/login flows. This works with the existing email, Google web/native, and custom-token login paths without introducing another provider-specific credential flow. The only new allowed return path is exactly `/profile/security`; it does not grant deletion permission or execute deletion.
- Keep the initiating UID and Auth creation time fixed. Profile deletion calls the server job endpoint, never the local `deleteCurrentUser` adapter. Retain the receipt after completion so the logged-out status page can confirm the result; never clear it while status is uncertain.
- The server independently enforces recent `request.auth.token.auth_time`, matching identity, and explicit confirmation. Durable cleanup/retry is implemented in `functions/account-deletion.js`; it provides resumable deletion, **not all-or-nothing rollback**.
- Kakao/Naver custom-token issuance checks the deletion job before creating a user and before issuing a token. Do not recreate a deterministic social UID while deletion is pending/blocked.
- Sources: [Firebase user management](https://firebase.google.com/docs/auth/web/manage-users#re-authenticate_a_user), [IdTokenResult.authTime](https://firebase.google.com/docs/reference/js/auth.idtokenresult#idtokenresultauthtime).
