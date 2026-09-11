import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAccountDeletionGuard, ACCOUNT_DELETION_LOGIN_MAX_AGE_MS } from '../src/domains/auth/services/account-deletion-guard.mjs';

const clock = Date.parse('2026-09-10T12:00:00Z');
const tokenAt = age => ({ authTime: new Date(clock-age).toUTCString(), issuedAtTime: new Date(clock).toUTCString() });

function fixture({ token = tokenAt(0), read, user = {uid:'owner'} } = {}) {
  const session = {user};
  const calls = [];
  const guard = createAccountDeletionGuard({
    getCurrentUser: () => session.user,
    getTokenResult: async user => { calls.push(user); if(read) return read(); return token; },
    now: () => clock,
  });
  return {guard,session,calls};
}

test('최근 실제 로그인만 허용하며 앱의 사전 확인 경계는 1분이다', async () => {
  assert.equal(ACCOUNT_DELETION_LOGIN_MAX_AGE_MS,60_000);
  for(const age of [0,30_000,60_000]) {
    assert.deepEqual(await fixture({token:tokenAt(age)}).guard('owner'), {userId:'owner'});
  }
  await assert.rejects(fixture({token:tokenAt(61_000)}).guard('owner'), {code:'auth/requires-recent-login'});
});

test('방금 갱신된 토큰도 실제 로그인 시각이 오래됐으면 삭제를 허용하지 않는다', async () => {
  const app=fixture({token:tokenAt(24*60*60*1000)});
  await assert.rejects(app.guard('owner'), {code:'auth/requires-recent-login'});
  assert.equal(app.calls.length,1);
});

test('로그인 시각 누락·손상·미래 시각은 안전하게 중단한다', async () => {
  for(const token of [null,{}, {authTime:''},{authTime:'invalid'},tokenAt(-1000)]) {
    await assert.rejects(fixture({token}).guard('owner'), {code:'auth/requires-recent-login'});
  }
});

test('로그인 제공자와 무관하게 동일한 실제 로그인 시각을 검사한다', async () => {
  for(const provider of ['google.com','password','custom']) {
    assert.deepEqual(await fixture({token:{...tokenAt(1000),signInProvider:provider}}).guard('owner'), {userId:'owner'});
    await assert.rejects(fixture({token:{...tokenAt(3600_000),signInProvider:provider}}).guard('owner'), {code:'auth/requires-recent-login'});
  }
});

test('로그인하지 않았거나 요청 계정이 다르면 토큰도 조회하지 않는다', async () => {
  for(const user of [null,{uid:'other'}]) {
    const app=fixture({user});
    await assert.rejects(app.guard('owner'), {code:'profile/account-changed'});
    assert.deepEqual(app.calls,[]);
  }
});

test('토큰 조회 중 계정 변경·로그아웃은 인증 완료로 인정하지 않는다', async () => {
  for(const next of [null,{uid:'other'}]) {
    let finish;
    const app=fixture({read:()=>new Promise(resolve=>{finish=resolve;})});
    const pending=app.guard('owner');
    app.session.user=next;
    finish(tokenAt(0));
    await assert.rejects(pending, {code:'profile/account-changed'});
  }
});

test('네트워크·토큰 오류는 최근 로그인으로 간주하지 않고 원래 오류를 전달한다', async () => {
  const failure=Object.assign(new Error('offline'),{code:'auth/network-request-failed'});
  const app=fixture({read:()=>{throw failure;}});
  await assert.rejects(app.guard('owner'), error=>error===failure);
});

// 실제 Firebase 어댑터 함수도 실행한다. SDK/스토리지 경계만 대체한다.
const authSource=readFileSync(new URL('../src/domains/auth/services/firebase-auth.js',import.meta.url),'utf8')
  .replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.env','env');
function authFixture({deleteError}={}) {
  const auth={currentUser:{uid:'owner'}};
  const calls=[];
  const deps={
    env:{VITE_FIREBASE_API_KEY:'test',VITE_FIREBASE_AUTH_DOMAIN:'test',VITE_FIREBASE_PROJECT_ID:'test',VITE_FIREBASE_APP_ID:'test'},
    initializeApp:()=>({}),initializeAuth:()=>auth,GoogleAuthProvider:class{},
    indexedDBLocalPersistence:{},browserLocalPersistence:{},browserSessionPersistence:{},
    createAccountDeletionGuard,
    getIdTokenResult:async (user,force)=>{calls.push(['token',user.uid,force]); return {authTime:new Date().toUTCString()};},
    deleteUser:async user=>{calls.push(['delete',user.uid]); if(deleteError)throw deleteError;},
    localStorage:{removeItem:key=>calls.push(['local',key])},
    sessionStorage:{removeItem:key=>calls.push(['session',key])},
  };
  const api=new Function(...Object.keys(deps),authSource+'\nreturn {requireRecentLoginForDeletion,deleteCurrentUser};')(...Object.values(deps));
  return {api,auth,calls};
}

test('Firebase 어댑터는 현재 사용자 토큰을 서버에서 강제 갱신해 확인한다', async () => {
  const app=authFixture();
  await app.api.requireRecentLoginForDeletion('owner');
  assert.deepEqual(app.calls,[['token','owner',true]]);
});

test('Firebase 인증 삭제가 실패하면 로컬 저장소도 먼저 비우지 않는다', async () => {
  const failure=new Error('delete failed');
  const app=authFixture({deleteError:failure});
  await assert.rejects(app.api.deleteCurrentUser('owner'),error=>error===failure);
  assert.deepEqual(app.calls,[['delete','owner']]);
});

test('Firebase 인증 삭제 성공 후에만 로컬 상태를 정리한다', async () => {
  const app=authFixture();
  await app.api.deleteCurrentUser('owner');
  assert.deepEqual(app.calls,[['delete','owner'],['local','hasSeenTutorial'],['session','currentFormData'],['session','savedItineraryData']]);
});

test('Firebase 인증 삭제 어댑터도 대상 계정 변경을 차단한다', async () => {
  const app=authFixture();
  app.auth.currentUser={uid:'other'};
  await assert.rejects(app.api.deleteCurrentUser('owner'), {code:'profile/account-changed'});
  assert.deepEqual(app.calls,[]);
});
