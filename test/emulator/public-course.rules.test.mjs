import './assert-local.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const project = 'demo-hackerton-deletion';
const root = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = uid => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid, aud: project, iss: `https://securetoken.google.com/${project}`, iat: 2000, exp: 9999999999, auth_time: 2000, firebase: { sign_in_provider: 'password' } })}.`;
const field = value => value === null ? { nullValue: null } : value instanceof Date ? { timestampValue: value.toISOString() } : Array.isArray(value) ? { arrayValue: { values: value.map(field) } }
  : value && typeof value === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, field(entry)])) } }
    : typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value };
const fields = data => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)]));
async function request(path, { method = 'GET', user, data, admin = false } = {}) {
  return fetch(`${root}/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : user ? { Authorization: `Bearer ${token(user)}` } : {}) }, ...(data ? { body: JSON.stringify({ fields: fields(data) }) } : {}) });
}

test('AI recommendation limits reserve atomically and cannot be read or reset by clients',async()=>{
  const require=createRequire(new URL('../../functions/index.js',import.meta.url));
  const {initializeApp,deleteApp}=require('firebase-admin/app');
  const {getFirestore}=require('firebase-admin/firestore');
  const {createRecommendationLimiter}=require('./place-recommendations');
  const app=initializeApp({projectId:project},'ai-limits-test');const db=getFirestore(app);
  try {
    await db.collection('ai_place_limits').doc('global').set({});
    const reserve=createRecommendationLimiter({db,now:()=>Date.parse('2026-10-14T03:00:00Z')});
    const results=await Promise.allSettled(Array.from({length:8},()=>reserve('emulator-fixture-ip')));
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal((await db.collection('ai_place_limits').doc('global').get()).data().count,1);
    for(const user of [undefined,'limits-user']) {
      assert.equal((await request('ai_place_limits/global',{user})).status,403);
      assert.equal((await request('ai_place_limits/global',{user,method:'PATCH',data:{count:0}})).status,403);
    }
  } finally {await db.terminate();await deleteApp(app);}
});

test('discovery counts are public, personal saves are owner-only, and clients cannot inflate counts', async () => {
  await request('discovery_popularity/forest', { method: 'PATCH', admin: true, data: { count: 2, updatedAt: 2000000 } });
  await request('discovery_saves/saveOwner', { method: 'PATCH', admin: true, data: { placeIds: ['forest'], identityCreatedAt: 'first' } });
  assert.equal((await request('discovery_popularity/forest')).status, 200);
  assert.equal((await request('discovery_saves/saveOwner', { user: 'saveOwner' })).status, 200);
  for (const user of [undefined, 'someoneElse']) assert.equal((await request('discovery_saves/saveOwner', { user })).status, 403);
  assert.equal((await request('discovery_popularity/forest', { method: 'PATCH', user: 'saveOwner', data: { count: 999 } })).status, 403);
  assert.equal((await request('discovery_saves/saveOwner', { method: 'PATCH', user: 'saveOwner', data: { placeIds: ['forest'] } })).status, 403);
});

test('public courses require owner opt-in, bounded fields, and support unpublishing', async () => {
  const sourceId = 'publicSource';
  const path = `public_courses/${sourceId}`;
  const stops = [
    { name: 'Museum', location: 'Seoul Museum', stayMinutes: 90 },
    { name: 'Cafe', location: 'Seoul cafe', stayMinutes: 60 },
  ];
  const data = { ownerId: 'publisher', sourceId, title: 'A quiet afternoon', review: 'Easy to walk', stops, createdAt: new Date('2026-10-04') };
  assert.equal((await request(`itineraries/${sourceId}`, { method: 'PATCH', admin: true, data: { userId: 'publisher' } })).status, 200);
  assert.equal((await request(path)).status, 404);
  for (const user of [undefined, 'intruder']) assert.equal((await request(path, { method: 'PATCH', user, data })).status, 403);
  const { createdAt, ...publicFields } = data;
  const created = await fetch(`${root}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token('publisher')}` }, body: JSON.stringify({ writes: [{
    update: { name: `projects/${project}/databases/(default)/documents/${path}`, fields: fields(publicFields) },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
  }] }) });
  assert.equal(created.status, 200, await created.text());
  data.createdAt = new Date((await (await request(path)).json()).fields.createdAt.timestampValue);
  assert.equal((await request(path)).status, 200);
  assert.equal((await request(path, { method: 'PATCH', user: 'publisher', data: { ...data, review: 'A little longer at the museum' } })).status, 200);
  assert.equal((await request(path, { method: 'PATCH', user: 'intruder', data: { ...data, ownerId: 'intruder' } })).status, 403);
  assert.equal((await request(path, { method: 'PATCH', user: 'publisher', data: { ...data, secret: 'private' } })).status, 403);
  assert.equal((await request(path, { method: 'PATCH', user: 'publisher', data: { ...data, stops: [stops[0]] } })).status, 403);
  const changed = { ...data, stops: [{ ...stops[0], stayMinutes: 120 }, stops[1]] };
  assert.equal((await request(path, { method: 'PATCH', user: 'publisher', data: changed })).status, 403, 'changed visits must start a new publication');
  delete changed.createdAt;
  const reset = await fetch(`${root}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token('publisher')}` }, body: JSON.stringify({ writes: [{
    update: { name: `projects/${project}/databases/(default)/documents/${path}`, fields: fields(changed) },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
  }] }) });
  assert.equal(reset.status, 200, await reset.text());
  const latest = new Date((await (await request(path)).json()).fields.createdAt.timestampValue);
  const extras = { ...changed, createdAt: latest, titleEn: 'Museum and cafe', credit: { name: 'Travel creator', url: 'https://example.com/post' } };
  assert.equal((await request(path, { method: 'PATCH', user: 'publisher', data: extras })).status, 200);
  const visitorInfo = { englishMenu: 'available', reservation: 'recommended', sourceUrl: 'https://example.com/menu', checkedOn: '2026-10-04' };
  const withInfo = { ...extras, stops: [{ ...stops[0], englishName: 'Museum', visitorInfo }, stops[1]] };
  delete withInfo.createdAt;
  const publishInfo = payload => fetch(`${root}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token('publisher')}` }, body: JSON.stringify({ writes: [{
    update: { name: `projects/${project}/databases/(default)/documents/${path}`, fields: fields(payload) },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
  }] }) });
  for (const patch of [{ sourceUrl: '' }, { sourceUrl: 'javascript:alert(1)' }, { checkedOn: '' }, { privateNote: 'hotel' }]) {
    assert.equal((await publishInfo({ ...withInfo, stops: [{ ...withInfo.stops[0], visitorInfo: { ...visitorInfo, ...patch } }, stops[1]] })).status, 403);
  }
  assert.equal((await publishInfo({ ...withInfo, credit: { name: 'Creator', url: 'javascript:alert(1)' } })).status, 403);
  const checked = await publishInfo(withInfo); assert.equal(checked.status, 200, await checked.text());
  const guest = await request(path); assert.equal(guest.status, 200);
  assert.equal((await guest.json()).fields.stops.arrayValue.values[0].mapValue.fields.englishName.stringValue, 'Museum');
  assert.equal((await request(path, { method: 'DELETE', user: 'intruder' })).status, 403);
  assert.equal((await request(path, { method: 'DELETE', user: 'publisher' })).status, 200);
  assert.equal((await request(path)).status, 404);
});

test('traveler reviews enforce authorship, public scope and publication identity', async () => {
  const courseId = 'reviewSource';
  const publishedAt = new Date('2026-10-04T00:00:00Z');
  await request(`public_courses/${courseId}`, { method: 'PATCH', admin: true, data: { ownerId: 'routeOwner', createdAt: publishedAt } });
  const data = { userId: 'traveler', courseId, courseCreatedAt: publishedAt, visitDate: '2026-10-04', comment: 'More time at the museum', walkingKm: 3, spentWon: 20000, visitMinutes: 120 };
  const id = `${courseId}_traveler`;
  const write = (user, review = data, reviewId = id) => fetch(`${root}:commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${token(user)}` } : {}) },
    body: JSON.stringify({ writes: [{ update: { name: `projects/${project}/databases/(default)/documents/course_reviews/${reviewId}`, fields: fields(review) }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] }] }),
  });
  for (const user of [undefined, 'other']) assert.equal((await write(user)).status, 403);
  const saved = await write('traveler'); assert.equal(saved.status, 200, await saved.text());
  assert.equal((await request(`course_reviews/${id}`)).status, 200);
  assert.equal((await write('traveler', { ...data, comment: 'Edited experience', spentWon: null })).status, 200);
  for (const patch of [{ walkingKm: -1 }, { comment: 'x'.repeat(601) }, { privateAddress: 'hotel' }, { courseCreatedAt: new Date('2026-10-03') }]) assert.equal((await write('traveler', { ...data, ...patch })).status, 403);
  assert.equal((await write('traveler', data, 'duplicateReview')).status, 403);
  assert.equal((await write('routeOwner', { ...data, userId: 'routeOwner' }, `${courseId}_routeOwner`)).status, 403);
  const query = await fetch(`${root}:runQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'course_reviews' }], where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'courseId' }, op: 'EQUAL', value: field(courseId) } },
      { fieldFilter: { field: { fieldPath: 'courseCreatedAt' }, op: 'EQUAL', value: field(publishedAt) } },
    ] } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 10,
  } }) });
  assert.equal(query.status, 200, await query.text());
  assert.equal((await request(`course_reviews/${id}`, { method: 'DELETE', user: 'other' })).status, 403);
  await request(`public_courses/${courseId}`, { method: 'DELETE', admin: true });
  assert.equal((await request(`course_reviews/${id}`)).status, 403);
  await request(`public_courses/${courseId}`, { method: 'PATCH', admin: true, data: { ownerId: 'routeOwner', createdAt: new Date('2026-10-05') } });
  assert.equal((await request(`course_reviews/${id}`)).status, 403, 'old reviews must not appear on a new publication');
  assert.equal((await request(`course_reviews/${id}`, { method: 'DELETE', user: 'traveler' })).status, 200);
});

test('publication cleanup deletes only the removed publication, preserving reviews after republish', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(new URL('../../functions/package.json', import.meta.url));
  const admin = require('firebase-admin');
  const { deletePublicationReviews } = require('./course-review-cleanup.js');
  const app = admin.initializeApp({ projectId: project }, 'course-cleanup');
  const db = app.firestore();
  const old = admin.firestore.Timestamp.fromMillis(1000);
  const fresh = admin.firestore.Timestamp.fromMillis(2000);
  try {
    await db.doc('course_reviews/cleanupOld').set({ courseId: 'cleanupCourse', courseCreatedAt: old });
    await db.doc('course_reviews/cleanupNew').set({ courseId: 'cleanupCourse', courseCreatedAt: fresh });
    await deletePublicationReviews(db, 'cleanupCourse', old);
    assert.equal((await db.doc('course_reviews/cleanupOld').get()).exists, false);
    assert.equal((await db.doc('course_reviews/cleanupNew').get()).exists, true);
  } finally { await app.delete(); }
});

test('saved trips accept owner plan edits in place; owner, creation time and other fields stay fixed', async () => {
  const createdAt = new Date('2026-10-01T00:00:00Z');
  const plan = titles => ({ days: titles.map((title, index) => ({ day: index + 1, scheduleItems: [{ title }] })) });
  const edit = (user, data, mask = 'itineraryPlan', path = 'itineraries/editableTrip') =>
    request(`${path}?updateMask.fieldPaths=${mask}`, { method: 'PATCH', user, data });
  await request('itineraries/editableTrip', { method: 'PATCH', admin: true, data: { userId: 'tripOwner', title: 'Seoul', createdAt, itineraryPlan: plan(['경복궁']) } });
  for (const user of [undefined, 'intruder']) assert.equal((await edit(user, { itineraryPlan: plan(['침입']) })).status, 403, String(user));

  const saved = await edit('tripOwner', { itineraryPlan: plan(['덕수궁']) });
  assert.equal(saved.status, 200, await saved.text());
  const { fields: stored } = await (await request('itineraries/editableTrip', { user: 'tripOwner' })).json();
  assert.equal(stored.userId.stringValue, 'tripOwner');
  assert.equal(stored.title.stringValue, 'Seoul');
  assert.equal(Date.parse(stored.createdAt.timestampValue), createdAt.getTime());
  assert.equal(stored.itineraryPlan.mapValue.fields.days.arrayValue.values[0].mapValue.fields.scheduleItems.arrayValue.values[0].mapValue.fields.title.stringValue, '덕수궁');

  for (const [mask, data] of [['userId', { userId: 'intruder' }], ['createdAt', { createdAt: new Date() }], ['secret', { secret: 'x' }],
    ['itineraryPlan', { itineraryPlan: 'x' }], ['title', { title: '' }], ['title', { title: 'x'.repeat(101) }]]) {
    assert.equal((await edit('tripOwner', data, mask)).status, 403, mask);
  }
  assert.equal((await edit('tripOwner', { title: '서울 여행' }, 'title')).status, 200);

  // Trips saved before titles existed can still be edited.
  await request('itineraries/untitledTrip', { method: 'PATCH', admin: true, data: { userId: 'tripOwner', itineraryPlan: plan(['경복궁']) } });
  assert.equal((await edit('tripOwner', { itineraryPlan: plan(['덕수궁']) }, 'itineraryPlan', 'itineraries/untitledTrip')).status, 200);

  await request('itineraries/fencedTrip', { method: 'PATCH', admin: true, data: { userId: 'fencedOwner', title: 'Seoul', itineraryPlan: plan(['경복궁']) } });
  await request('account_deletions/fencedOwner', { method: 'PATCH', admin: true, data: { state: 'pending' } });
  assert.equal((await edit('fencedOwner', { itineraryPlan: plan(['덕수궁']) }, 'itineraryPlan', 'itineraries/fencedTrip')).status, 403);
});
