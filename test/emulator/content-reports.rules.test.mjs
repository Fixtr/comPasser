import './assert-local.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const project = 'demo-hackerton-deletion';
const root = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = uid => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid, aud: project, iss: `https://securetoken.google.com/${project}`, iat: 2000, exp: 9999999999, auth_time: 2000, firebase: { sign_in_provider: 'password' } })}.`;
const field = value => value === 'NOW' ? null : { stringValue: value };
// createdAt must be the server time, so it goes in as a transform, as the client's serverTimestamp() does.
async function report(data, user) {
  const fields = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== 'NOW').map(([key, value]) => [key, field(value)]));
  const transforms = Object.entries(data).filter(([, value]) => value === 'NOW').map(([fieldPath]) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' }));
  const name = `projects/${project}/databases/(default)/documents/content_reports/r${Math.random().toString(36).slice(2)}`;
  return fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${token(user)}` } : {}) },
    body: JSON.stringify({ writes: [{ update: { name, fields }, ...(transforms.length ? { updateTransforms: transforms } : {}), currentDocument: { exists: false } }] }),
  });
}

const seed = path => fetch(`${root}/${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields: { title: { stringValue: 'seed' } } }) });

test('signed-in users can file an anonymous report of a real post that nobody can read back or change', async () => {
  assert.equal((await seed('public_courses/reportedCourse')).status, 200);
  assert.equal((await seed('course_reviews/reportedCourse_author')).status, 200);
  const review = { kind: 'review', targetId: 'reportedCourse_author', authorId: 'author', text: 'Rude words', createdAt: 'NOW' };
  const course = { kind: 'course', targetId: 'reportedCourse', authorId: 'owner1', text: 'Spam walk', createdAt: 'NOW' };
  assert.equal((await report(review, 'reporter')).status, 200);
  assert.equal((await report(course, 'reporter')).status, 200);
  for (const [data, user] of [
    [review, undefined],
    [{ ...course, kind: 'user' }, 'reporter'],
    [{ ...course, targetId: 'missingCourse' }, 'reporter'],
    [{ ...review, targetId: 'reportedCourse_nobody' }, 'reporter'],
    [{ ...course, targetId: '' }, 'reporter'],
    [{ ...course, text: 'x'.repeat(1001) }, 'reporter'],
    [{ kind: 'course', targetId: 'reportedCourse', authorId: 'owner1', text: '' }, 'reporter'],
    [{ ...course, reporterId: 'reporter' }, 'reporter'],
  ]) assert.equal((await report(data, user)).status, 403, JSON.stringify({ data, user }));
  const list = await fetch(`${root}/content_reports`, { headers: { Authorization: `Bearer ${token('reporter')}` } });
  assert.equal(list.status, 403);
});
