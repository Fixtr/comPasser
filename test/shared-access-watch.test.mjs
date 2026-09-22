import test from 'node:test';
import assert from 'node:assert/strict';
import { watchSharedAccess } from '../src/domains/itinerary/services/shared-access-watch.mjs';

function timers() {
  let id=0;
  const tasks=new Map();
  return {
    tasks,
    schedule(fn,ms) { tasks.set(++id,{fn,ms}); return id; },
    cancel(id) { tasks.delete(id); },
    run(ms) {
      const entry=[...tasks].find(([,task])=>task.ms===ms);
      assert.ok(entry,`timer ${ms} must exist`);
      tasks.delete(entry[0]);
      return entry[1].fn();
    },
  };
}

test('shared access checks sequentially; deletion invalidates once and stops timers',async()=>{
  const clock=timers(); let exists=true,reads=0,invalidations=0;
  const stop=watchSharedAccess(async()=>{reads++;return exists;},()=>invalidations++,clock);
  assert.equal(reads,0);
  await clock.run(15000);
  assert.equal(reads,1);
  assert.equal(invalidations,0);
  assert.equal(clock.tasks.size,1);
  exists=false;
  await clock.run(15000);
  assert.equal(invalidations,1);
  assert.equal(clock.tasks.size,0);
  stop();
});

test('network denial hides shared content without claiming deletion',async()=>{
  const clock=timers();let invalidations=0;
  watchSharedAccess(async()=>{throw Error('unavailable');},()=>invalidations++,clock);
  await clock.run(15000);
  assert.equal(invalidations,1);
  assert.equal(clock.tasks.size,0);
});

test('hung server checks expire and do not overlap or retain content indefinitely',async()=>{
  const clock=timers();let invalidations=0;
  watchSharedAccess(()=>new Promise(()=>{}),()=>invalidations++,clock);
  const pending=clock.run(15000);
  assert.equal(clock.tasks.size,1);
  clock.run(8000);
  await pending;
  assert.equal(invalidations,1);
  assert.equal(clock.tasks.size,0);
});

test('leaving the share ignores a late denied request and cancels every timer',async()=>{
  const clock=timers();let resolveRead,invalidations=0;
  const read=new Promise(resolve=>resolveRead=resolve);
  const stop=watchSharedAccess(()=>read,()=>invalidations++,clock);
  const pending=clock.run(15000);
  stop();
  resolveRead(false);
  await pending;
  assert.equal(invalidations,0);
  assert.equal(clock.tasks.size,0);
});
