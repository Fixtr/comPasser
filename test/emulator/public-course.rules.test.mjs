import './assert-local.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const project = 'demo-hackerton-deletion';
const root = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = uid => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid, aud: project, iss: `https://securetoken.google.com/${project}`, iat: 2000, exp: 9999999999, auth_time: 2000, firebase: { sign_in_provider: 'password' } })}.`;
const field = value => Array.isArray(value) ? { arrayValue: { values: value.map(field) } }
  : value && typeof value === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, field(entry)])) } }
    : typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value };
const fields = data => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)]));
async function request(path, { method = 'GET', user, data, admin = false } = {}) {
  return fetch(`${root}/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : user ? { Authorization: `Bearer ${token(user)}` } : {}) }, ...(data ? { body: JSON.stringify({ fields: fields(data) }) } : {}) });
}

test('public courses require owner opt-in, bounded fields, and support unpublishing', async () => {
  const sourceId = 'publicSource';
  const path = `public_courses/${sourceId}`;
  const stops = [
    { name: 'Museum', location: 'Seoul Museum', stayMinutes: 90 },
    { name: 'Cafe', location: 'Seoul cafe', stayMinutes: 60 },
  ];
  const data = { ownerId: 'publisher', sourceId, title: 'A quiet afternoon', review: 'Easy to walk', stops, createdAt: '2026-10-04' };
  assert.equal((await request(`itineraries/${sourceId}`, { method: 'PATCH', admin: true, data: { userId: 'publisher' } })).status, 200);
  assert.equal((await request(path)).status, 404);
  for (const user of [undefined, 'intruder']) assert.equal((await request(path, { method: 'PATCH', user, data })).status, 403);
  const created = await request(path, { method: 'PATCH', user: 'publisher', data });
  assert.equal(created.status, 200, await created.text());
  assert.equal((await request(path)).status, 200);
  assert.equal((await request(path, { method: 'PATCH', user: 'publisher', data: { ...data, review: 'A little longer at the museum' } })).status, 200);
  assert.equal((await request(path, { method: 'PATCH', user: 'intruder', data: { ...data, ownerId: 'intruder' } })).status, 403);
  assert.equal((await request(path, { method: 'PATCH', user: 'publisher', data: { ...data, secret: 'private' } })).status, 403);
  assert.equal((await request(path, { method: 'PATCH', user: 'publisher', data: { ...data, stops: [stops[0]] } })).status, 403);
  assert.equal((await request(path, { method: 'DELETE', user: 'intruder' })).status, 403);
  assert.equal((await request(path, { method: 'DELETE', user: 'publisher' })).status, 200);
  assert.equal((await request(path)).status, 404);
});
