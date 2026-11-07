// Playwright MCP browser_run_code_unsafe(filename=...) callback.
// Local-only browser harness: production UI/services stay real; external boundaries are fakes.
async (page) => {
  const origin = page.smokeOrigin || 'http://127.0.0.1:4173';
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Local smoke origin required');
  if (!page.url().startsWith(origin + '/')) throw new Error('Open the isolated local page before setup');
  await page.unrouteAll({ behavior: 'wait' });
  await page.evaluate(() => {
    for (const key of ['__smoke_user','__smoke_db','userPreference','currentFormData']) sessionStorage.removeItem(key);
    sessionStorage.removeItem('__smoke_deletion');
    sessionStorage.removeItem('__smoke_credits');
    for (const key of Object.keys(localStorage)) if (key.startsWith('accountDeletionReceipt:smoke')) localStorage.removeItem(key);
  });
  page.smokeErrors = [];
  page.on('pageerror', error => page.smokeErrors.push(error.message));
  const modules = {
    '/src/domains/profile/services/account-deletion-api.js': `
      import { createAccountDeletionClient } from '/src/domains/profile/services/account-deletion-client.mjs';
      import { getCurrentUser } from '/src/domains/auth/services/firebase-auth.js';
      const read = () => JSON.parse(sessionStorage.getItem('__smoke_deletion') || 'null');
      const save = job => sessionStorage.setItem('__smoke_deletion', JSON.stringify(job));
      window.__smoke.finishServerDeletion = () => {
        const job = read(); if (!job) return;
        const db = JSON.parse(sessionStorage.getItem('__smoke_db'));
        for (const [id, trip] of Object.entries(db.itineraries || {})) if (trip.userId === job.userId) delete db.itineraries[id];
        delete db.users[job.userId];
        sessionStorage.setItem('__smoke_db', JSON.stringify(db));
        save({ ...job, state: 'completed', stage: 'done' });
      };
      export const accountDeletionClient = createAccountDeletionClient({
        getCurrentUser, storage: localStorage,
        randomReceipt: () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2,'0')).join(''),
        async submit(data) {
          window.__smoke.calls.push('server-request');
          let job = read();
          if (!job || job.userId !== data.expectedUid) {
            job = { receipt: data.receipt, userId: data.expectedUid, state:'pending', stage:'itineraries' }; save(job);
            if (window.__smoke.dbError !== 'delete') {
              window.__smoke.finishServerDeletion();
              if (window.__smoke.authError) save({ ...job, state:'pending', stage:'auth' });
            }
          }
          if (window.__smoke.loseDeletionResponse) throw new Error('TEST: response lost after acceptance');
          return read();
        },
        async getStatus(data) {
          const job = read();
          if (!job || (data.receipt ? data.receipt !== job.receipt : job.userId !== getCurrentUser()?.uid)) return {state:'not-found'};
          return job;
        },
      });
    `,
    '/src/domains/auth/services/firebase-auth.js': `
      import { createAccountDeletionGuard } from '/src/domains/auth/services/account-deletion-guard.mjs';
      export const app = null, missingFirebaseConfig = [];
      export const getCurrentUser = () => window.__smoke.user;
      const listeners = [];
      window.__smoke.setUser = user => {
        window.__smoke.user = user;
        sessionStorage.setItem('__smoke_user', JSON.stringify(user));
        listeners.forEach(fn => fn(user));
      };
      export function subscribeToAuthChanges(fn) { listeners.push(fn); queueMicrotask(() => fn(getCurrentUser())); return () => {}; }
      export async function logout() { window.__smoke.calls.push('logout'); window.__smoke.setUser(null); }
      export const requireRecentLoginForDeletion = createAccountDeletionGuard({
        getCurrentUser,
        getTokenResult: async () => {
          window.__smoke.calls.push('check-login');
          if(window.__smoke.holdLoginCheck) await new Promise(resolve=>{window.__smoke.finishLoginCheck=resolve;});
          if(window.__smoke.loginCheckError) throw Object.assign(new Error('TEST: token unavailable'),{code:'auth/network-request-failed'});
          return {authTime:new Date(Date.now()-(window.__smoke.loginAgeMs||0)).toUTCString()};
        },
      });
      export async function deleteCurrentUser() {
        window.__smoke.calls.push('delete-auth');
        if (window.__smoke.authError) throw Object.assign(new Error('TEST: recent login required'), {code:window.__smoke.authError});
        window.__smoke.setUser(null);
      }
      const unsupported = async () => { throw new Error('Real authentication disabled in smoke test'); };
      export async function loginWithEmail(email,password) {
        if(email!=='smoke@example.invalid'||password!=='test-password') throw Object.assign(new Error('TEST: wrong password'),{code:'auth/invalid-credential'});
        window.__smoke.loginAgeMs=0;
        window.__smoke.setUser({uid:'smokeOwner',displayName:'검증 계정',email,emailVerified:true,providerData:[{providerId:'password'}]});
      }
      export async function sendPasswordReset(email,returnTo,language) {
        window.__smoke.calls.push('send-reset:'+email+'|'+returnTo+'|'+language);
        if(window.__smoke.resetDelay) await new Promise(resolve=>setTimeout(resolve,window.__smoke.resetDelay));
        if(window.__smoke.resetError) throw Object.assign(new Error('TEST: reset failed'),{code:window.__smoke.resetError});
      }
      export async function resetPassword(code,password) {
        window.__smoke.calls.push('confirm-reset:'+code+':'+password);
        if(window.__smoke.resetError) throw Object.assign(new Error('TEST: reset failed'),{code:window.__smoke.resetError});
      }
      export const loginWithGoogle=unsupported, loginWithCustomToken=unsupported,
        signUpWithEmail=unsupported, verifyEmailCode=unsupported;
    `,
    '/src/lib/firestore-lazy.mjs': `
      const read = () => JSON.parse(sessionStorage.getItem('__smoke_db') || '{}');
      const write = data => sessionStorage.setItem('__smoke_db', JSON.stringify(data));
      const fail = kind => { if(window.__smoke.dbError === kind) throw new Error('TEST: '+kind+' failed'); };
      const ref = (_db, collection, id) => collection ? ({collection, id})
        : ({collection:_db.collection,id:'smoke'+(Object.keys(read()[_db.collection]||{}).length+1)});
      const snapshot = (r, data) => ({id:r.id, ref:r, exists:()=>data!==undefined, data:()=>{
        const copy=structuredClone(data);
        if(copy?.createdAt?.seconds) copy.createdAt.toDate=()=>new Date(copy.createdAt.seconds*1000);
        return copy;
      }});
      export async function loadFirestore() {
        return {
          db:{}, doc:ref, collection:(_db, collection)=>({collection}),
          serverTimestamp:()=>({seconds:1790000000}),
          where:(field, operator, value)=>({field, operator, value}), orderBy:()=>null,
          query:(ref,...filters)=>({...ref,filters:filters.filter(Boolean)}),
          async getDoc(r) { fail('read'); return snapshot(r, read()[r.collection]?.[r.id]); },
          async getDocFromServer(r) {
            fail('read'); const db=read(), data=db[r.collection]?.[r.id];
            if(r.collection==='shared_itineraries' && data?.sourceId && db.itineraries?.[data.sourceId]?.userId!==data.ownerId)
              throw Object.assign(new Error('revoked'),{code:'permission-denied'});
            return snapshot(r,data);
          },
          writeBatch() {
            const ops=[]; return {set:(r,data)=>ops.push([r,data]), async commit(){
              fail('write'); const db=read(); for(const [r,data] of ops){db[r.collection]||={};db[r.collection][r.id]=data;}
              write(db); for(const [r] of ops)window.__smoke.calls.push('add:'+r.collection+':'+r.id);
            }};
          },
          async getDocs(q) {
            fail('read');
            const docs = Object.entries(read()[q.collection] || {})
              .filter(([,d])=>(q.filters||[]).every(f=>d[f.field]===f.value))
              .map(([id,d])=>snapshot({collection:q.collection,id},d));
            return {docs, forEach:fn=>docs.forEach(fn)};
          },
          async addDoc(r, data) {
            fail('write'); const db=read(); const id='smoke'+(Object.keys(db[r.collection]||{}).length+1);
            db[r.collection] ||= {}; db[r.collection][id]=data; write(db);
            window.__smoke.calls.push('add:'+r.collection+':'+id); return {id};
          },
          async setDoc(r, data, options) {
            fail('write'); const db=read(); db[r.collection] ||= {};
            db[r.collection][r.id]=options?.merge ? {...db[r.collection][r.id],...data}:data;
            write(db); window.__smoke.calls.push('set:'+r.collection+':'+r.id);
          },
          async updateDoc(r, data) {
            fail('write'); const db=read(); db[r.collection] ||= {};
            db[r.collection][r.id]={...db[r.collection][r.id],...data}; write(db);
            window.__smoke.calls.push('update:'+r.collection+':'+r.id);
          },
          async deleteDoc(r) {
            fail('delete'); const db=read(); delete db[r.collection]?.[r.id]; write(db);
            window.__smoke.calls.push('delete:'+r.collection+':'+r.id);
          },
        };
      }
    `,
    '/src/domains/planner/services/gemini-optimizer.js': `
      export async function getGenerationCredits() {
        if (window.__smoke.creditReadError) throw new Error('TEST: credits unavailable');
        return window.__smoke.creditBalance;
      }
      export function generateOptimizedItinerary(request) {
        window.__smoke.requests.push(structuredClone(request));
        return new Promise((resolve,reject) => window.__smoke.pending.push({
          resolve(plan) {
            window.__smoke.creditBalance--;
            sessionStorage.setItem('__smoke_credits',String(window.__smoke.creditBalance));
            resolve(plan);
          }, reject,
        }));
      }
    `,
    '/src/domains/map/services/google-maps-loader.js': `
      import fixtures from '/test/fixtures/destination-places.json?import';
      class PlaceInput extends HTMLElement {
        constructor() { super(); this.attachShadow({mode:'open'}); }
        connectedCallback() {
          this.shadowRoot.innerHTML='<input aria-label="테스트 장소 입력" style="padding:12px;width:100%;box-sizing:border-box">';
          this.shadowRoot.querySelector('input').value=this._value||'';
        }
        get value(){ return this.shadowRoot.querySelector('input')?.value || this._value || ''; }
        set value(v){this._value=v;if(this.shadowRoot.querySelector('input'))this.shadowRoot.querySelector('input').value=v;}
      }
      if(!customElements.get('gmp-place-autocomplete')) customElements.define('gmp-place-autocomplete',PlaceInput);
      window.google ??= {maps:{TravelMode:{TRANSIT:'TRANSIT'}}};
      export const getMapsLoader=()=>({importLibrary:async()=>({
        DirectionsService:class {async route(){return {routes:[{legs:[{duration:{value:900}}]}]};}},
        Place:class {
        constructor({id}) { this.id=id; }
        async fetchFields() {
          if (window.__hoursDelay) await new Promise(resolve=>setTimeout(resolve,window.__hoursDelay));
          Object.assign(this,window.__hoursFixtures?.[this.id] || {});
        }
        static async searchByText(query) {
          const curated = query.fields?.includes('addressComponents') && fixtures.find(row => query.textQuery.startsWith(row.queryName + ' '));
          if (curated) return {places:[curated.place]};
          const named=window.__namedPlacesFixtures?.[query.textQuery.split(' ')[0]];
          return {places:named?[named]:window.__placesFixtures || []};
        }
      }})});
    `,
    '/src/domains/map/ui/map-view.js': `
      export class MapView extends HTMLElement {
        connectedCallback(){this.textContent='지도 API 대체 영역 — 실제 지도는 이번 검증 대상에서 제외';}
        clearMap(){} setInteractionEnabled(){} refitRoute(){}
      }
      customElements.define('map-view', MapView);
    `,
  };
  await page.route('**/*', async route => {
    const requestUrl = route.request().url();
    const pathname = requestUrl.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (!requestUrl.startsWith(origin+'/')) {
      // No analytics, real auth, AI, Maps, or Kakao requests leave this harness.
      if(pathname.includes('kakao.min.js')) return route.fulfill({contentType:'text/javascript',body:`window.Kakao={isInitialized:()=>true,Share:{sendDefault:payload=>window.__smoke.kakao.push(payload)}};`});
      if(route.request().resourceType()==='script') return route.fulfill({contentType:'text/javascript',body:''});
      if(route.request().resourceType()==='image') return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'});
      return route.fulfill({status:200,body:''});
    }
    if(modules[pathname]) return route.fulfill({contentType:'text/javascript',body:modules[pathname]});
    return route.continue();
  });
  await page.addInitScript(() => {
    const stored = sessionStorage.getItem('__smoke_user');
    window.__smoke = {
      user:stored ? JSON.parse(stored):{uid:'smokeOwner',displayName:'검증 계정',email:'smoke@example.invalid',emailVerified:true,providerData:[]},
      creditBalance:Number(sessionStorage.getItem('__smoke_credits') ?? 3),
      calls:[], requests:[], pending:[], kakao:[],
    };
    // The Ionic shell mounts <itinerary-view> only on /view, which shows the session draft or bounces to /plan.
    window.__smoke.openPlan = async (plan, { path = '/view' } = {}) => {
      let view = document.querySelector('itinerary-view');
      if (view) view.state.open(plan);
      else {
        const uid = window.__smoke.user?.uid;
        sessionStorage.setItem('compasser.itineraries.v1', JSON.stringify({ version: 1, userId: uid, entries: [{ source: { kind: 'draft', ownerId: uid }, plan, dayIndex: 0 }] }));
      }
      if (window.location.pathname === path) view?.renderCurrentState();
      else window.navigate(path);
      for (let tries = 0; tries < 400; tries++) {
        // Leaving /plan with inputs asks first; answer it the way a user moving on would.
        document.querySelector('[role="alertdialog"] .confirm-ok')?.click();
        view = document.querySelector('itinerary-view');
        if (view?.currentItinerary && window.location.pathname === path) return view;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('TEST: /view did not show the plan');
    };
    localStorage.setItem('hasSeenTutorial','true');
    if(!sessionStorage.getItem('userPreference')) sessionStorage.setItem('userPreference',JSON.stringify({date:['2026-10-20'],theme:'healing',budget:'standard'}));
    if(!sessionStorage.getItem('__smoke_db')) sessionStorage.setItem('__smoke_db',JSON.stringify({users:{smokeOwner:{birthday:'1990-01-01',phoneNumber:'01000000000',isVerified:false}}}));
  });
  await page.context().grantPermissions(['clipboard-read','clipboard-write'], {origin});
  await page.setViewportSize({width:1280,height:900});
  await page.goto(origin+'/plan');
  await page.locator('travel-form:visible #start-location input').waitFor({state:'visible'});
  return {url:page.url(), errors:page.smokeErrors, mode:'Real DOM/router/services, fake external boundaries'};
}
