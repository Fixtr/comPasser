# English route pages

`/en/routes` lists six curated city routes and up to 18 guest-readable public
courses. Individual `/en/routes/:id` pages provide English metadata, local
address copy, required-visit import, link sharing, printable QR and QR download.
The optional starting place stays in the visitor's session, not the shared URL.

Owners can add an English title, public creator name/original post link, English
place names and visitor information in the existing opt-in publication editor.
Menu/reservation claims require a source URL and check date. Pages label them as
publisher-checked; absent information is "Not checked". Original user notes are
not automatically translated. Actual creator and accommodation partnerships
are outside this implementation.

The Ionic release build bundles a Pages `_worker.js` with routes restricted by
`_routes.json`. `VITE_FIREBASE_PROJECT_ID` is embedded at build time; no Admin
credentials are used. The server reads only `public_courses` using public
Firestore rules, and masks responses to route fields. Deploy `firestore.rules`
before releasing optional metadata support.

Pages and QR are `no-store` and bypass the PWA cache. A removed public document
returns 404; an upstream failure returns 503 rather than old public content.
`robots.txt`, canonical links and `sitemap.xml` enable indexing; actual search
indexing is controlled by search engines. The sitemap includes curated routes
and at most 200 public documents; the directory falls back to curated routes
when public reads fail.

Run `npm run build:release`, then `npx wrangler pages dev dist` to test the Pages
runtime. Unit, Ionic browser, PWA and emulator checks cover the new flow.
