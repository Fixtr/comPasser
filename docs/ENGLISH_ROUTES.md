# English route pages

`/en/routes` lists three curated routes for every catalogue city (Korea, Japan,
Europe, Southeast Asia and the US) and up to 18 guest-readable public courses.
It starts with a Cities jump list, then one section per city in catalogue order
and a "Shared by travelers" section; every card is a same-site link over its
whole area. Curated titles name their stops ("Tokyo: Sensoji Temple and Tokyo
Tower"); a public title with no letters (such as '3') shows its stops instead.
Individual `/en/routes/:id` pages provide English metadata, local
address copy, required-visit import, link sharing, printable QR and QR download.
Korean curated stops show the Korean name and street address (`lang="ko"`).
Curated stops abroad have no street address in the catalogue, only a
'place, city' search text: they show it once with "Copy place name" and an
"Open in Google Maps" search link, and their second name line is the local name
(Japanese and French catalogue ids, `lang` set) or nothing, never the Korean
name the app's planner imports.
Every stop links to a Google Maps search (Korean stops also to Naver Map), and
every stop after the first to Google Maps transit directions from the previous
stop; there is no embedded map or measured travel time. A "Start planning" link
under the title jumps to the planning section. Pages follow the system dark
mode, or the theme stored by the app (`route-page.js` sets `data-theme`). The QR
downloads as PNG (drawn from the SVG in the browser) or SVG.
`/en` redirects to `/en/routes`; any other `/en/...` that is not a route gets an
English not-found page from the worker (`_routes.json` sends all of `/en/*` to it).
The optional starting place stays in the visitor's session, not the shared URL.

Owners can add an English title, public creator name/original post link, English
place names and visitor information in the existing opt-in publication editor.
Menu/reservation claims require a source URL and check date. Pages label them as
publisher-checked; absent information is "Not checked" on traveler routes, and
curated stops, which carry none, show no menu/reservation lines. Original user notes are
not automatically translated. Actual creator and accommodation partnerships
are outside this implementation.

The Ionic release build bundles a Pages `_worker.js` with routes restricted by
`_routes.json`. `VITE_FIREBASE_PROJECT_ID` is embedded at build time; no Admin
credentials are used. The server reads only `public_courses` using public
Firestore rules, and masks responses to route fields. Deploy `firestore.rules`
before releasing optional metadata support.

Pages and QR are `no-store` and bypass the PWA cache; offline, the service worker
answers route-page navigations with a short 'You are offline' page (503), never a
cached copy. A removed public document
returns 404; an upstream failure returns 503 rather than old public content.
`robots.txt`, canonical links and `sitemap.xml` enable indexing; actual search
indexing is controlled by search engines. The sitemap includes curated routes
and at most 200 public documents; the directory falls back to curated routes
when public reads fail.

Run `npm run build:release`, then `npx wrangler pages dev dist` to test the Pages
runtime. Unit, Ionic browser, PWA and emulator checks cover the new flow.
