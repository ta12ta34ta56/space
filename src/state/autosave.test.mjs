import assert from 'node:assert/strict';
import { createDocument } from '../model/model.built.mjs';
import { createDocStore } from './doc-store.built.mjs';
import { createAutosave } from './autosave.built.mjs';

/* ---------------------------------------------------------------- helpers -- */

const CREATED_AT = 1_700_000_000_000;

function counterIds(prefix = 'id') {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

function makeDoc(pageCount = 3) {
  return createDocument({
    trimId: '6x9',
    paper: 'bw-white',
    binding: 'paperback',
    pageCount,
    now: () => CREATED_AT,
    id: counterIds(),
  });
}

/** A store plus a dispatch that ticks the injected clock once per command. */
function freshStore(pageCount = 3) {
  const store = createDocStore(makeDoc(pageCount));
  let tick = CREATED_AT;
  const dispatch = (cmd) => {
    tick += 1000;
    store.getState().dispatch(cmd, tick);
  };
  return { store, dispatch, get: () => store.getState() };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * An in-memory double of the storage API — the spec allows a hand-written
 * double when it is simpler than fake-indexeddb (spec 04, Tests), and for a
 * debounce timer it is. It records every write, can hold one write open to
 * simulate an in-flight save, and can fail the next write.
 */
function fakeStorage() {
  const writes = [];
  let attempts = 0;
  let active = 0;
  let maxActive = 0;
  let gate = null;
  let failNext = null;

  return {
    writes,
    getAttempts: () => attempts,
    getMaxActive: () => maxActive,
    failNextWith(error) {
      failNext = error;
    },
    holdNext() {
      let release;
      gate = new Promise((resolve) => {
        release = resolve;
      });
      return release;
    },
    async writeAutosave(record) {
      attempts += 1;
      if (failNext !== null) {
        const error = failNext;
        failNext = null;
        throw error;
      }
      active += 1;
      maxActive = Math.max(maxActive, active);
      writes.push(record);
      try {
        if (gate !== null) await gate;
      } finally {
        active -= 1;
      }
    },
  };
}

/* ------------------------------------------------------------ debounce -- */

console.log('\n=== three rapid changes within the window produce one write, the latest ===');
{
  const { store, dispatch } = freshStore(3);
  const fake = fakeStorage();
  const autosave = createAutosave({ store, storage: fake, delayMs: 10, now: () => 1000 });

  assert.equal(autosave.getStatus(), 'idle');

  dispatch({ t: 'book/setTitle', title: 'One' });
  dispatch({ t: 'book/setTitle', title: 'Two' });
  dispatch({ t: 'book/setTitle', title: 'Three' });
  assert.equal(autosave.getStatus(), 'pending', 'a change arms the debounce');

  await sleep(40);

  assert.equal(fake.writes.length, 1, 'three changes produce one write');
  assert.equal(fake.writes[0].document.meta.title, 'Three', 'the write carries the latest Document, not the first');
  assert.equal(fake.writes[0].at, 1000, 'the record is stamped with the injected clock');
  assert.equal(autosave.getStatus(), 'saved');
  assert.equal(autosave.getLastSavedAt(), 1000);

  await autosave.stop();
}
console.log('PASS debounce');

/* ----------------------------------------------------------- stop flushes -- */

console.log('\n=== stop() flushes a pending save ===');
{
  const { store, dispatch } = freshStore(3);
  const fake = fakeStorage();
  // A delay far longer than the test, so the save can only happen via stop().
  const autosave = createAutosave({ store, storage: fake, delayMs: 60_000, now: () => 2000 });

  dispatch({ t: 'book/setTitle', title: 'Saved at close' });
  assert.equal(autosave.getStatus(), 'pending');
  assert.equal(fake.writes.length, 0, 'nothing written before the debounce elapses');

  await autosave.stop();

  assert.equal(fake.writes.length, 1, 'stop flushes the pending save');
  assert.equal(fake.writes[0].document.meta.title, 'Saved at close');
  assert.equal(autosave.getStatus(), 'saved');

  // A second stop is harmless.
  await autosave.stop();
  assert.equal(fake.writes.length, 1);
}
console.log('PASS stop flushes');

/* ------------------------------------------------------ no overlap / coalesce -- */

console.log('\n=== a save in flight does not overlap a second ===');
{
  const { store, dispatch } = freshStore(3);
  const fake = fakeStorage();
  const autosave = createAutosave({ store, storage: fake, delayMs: 10, now: () => 3000 });
  const release = fake.holdNext();

  dispatch({ t: 'book/setTitle', title: 'A' });
  await sleep(30); // debounce fires; the write starts and holds
  assert.equal(fake.writes.length, 1, 'the first save is in flight');
  assert.equal(fake.getMaxActive(), 1);

  dispatch({ t: 'book/setTitle', title: 'B' });
  await sleep(30); // B's debounce fires while A is still held open
  assert.equal(fake.writes.length, 1, 'a second write never overlaps the first');
  assert.equal(fake.getMaxActive(), 1, 'at most one write is in flight at any moment');

  release(); // A completes; the coalesced follow-up picks up the latest Document
  await sleep(30);

  assert.equal(fake.writes.length, 2, 'the coalesced save lands after the first completes');
  assert.equal(fake.writes[1].document.meta.title, 'B', 'the follow-up carries the latest Document');
  assert.equal(fake.getMaxActive(), 1, 'writes still never overlap');

  await autosave.stop();
}
console.log('PASS no overlap');

/* ------------------------------------------------------- failure, no loop -- */

console.log('\n=== StorageFullError sets status error and does not retry in a loop ===');
{
  const { store, dispatch } = freshStore(3);
  const fake = fakeStorage();
  const autosave = createAutosave({ store, storage: fake, delayMs: 10, now: () => 4000 });

  // A quota-style failure: named StorageFullError so the UI can tell it apart.
  fake.failNextWith(Object.assign(new Error('quota exceeded'), { name: 'StorageFullError' }));
  dispatch({ t: 'book/setTitle', title: 'Too big' });
  await sleep(30);

  assert.equal(autosave.getStatus(), 'error', 'the failure surfaces as status error');
  assert.equal(fake.getAttempts(), 1, 'the write was attempted exactly once');
  assert.equal(fake.writes.length, 0, 'nothing was recorded as saved');

  await sleep(40);
  assert.equal(fake.getAttempts(), 1, 'there is no retry loop after the failure');
  assert.equal(autosave.getStatus(), 'error', 'the error status persists');
  assert.equal(autosave.getLastSavedAt(), null, 'nothing is reported as saved');

  await autosave.stop();
  assert.equal(fake.getAttempts(), 1, 'stop does not retry a failed save either');
}
console.log('PASS failure, no retry');

console.log('\nALL AUTOSAVE TESTS PASSED');
