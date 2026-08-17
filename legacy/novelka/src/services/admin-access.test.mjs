/**
 * Admin access tests.  npm run test:admin
 *
 * The unlock window and the key-sequence watcher — specifically that an author
 * typing normally can never trip it.
 */
import {
  ADMIN_SESSION_MINUTES,
  UNLOCK_SEQUENCE,
  isUnlocked,
  lock,
  markUnlocked,
} from './admin-access.built.mjs';

const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};
const KEY = 'novelka.admin-unlocked.v1';

console.log('\n=== unlock window ===');
{
  store.clear();
  check('locked by default', !isUnlocked());
  markUnlocked();
  check('unlocking works', isUnlocked());
  lock();
  check('locking works', !isUnlocked());
}
{
  store.clear();
  markUnlocked();
  // walk the clock past the window
  store.set(KEY, String(Date.now() - (ADMIN_SESSION_MINUTES + 1) * 60_000));
  check('the unlock expires', !isUnlocked());
  check('the expired entry is cleared', !store.has(KEY));
}
{
  store.clear();
  store.set(KEY, String(Date.now() - (ADMIN_SESSION_MINUTES - 1) * 60_000));
  check('still unlocked just inside the window', isUnlocked());
}
{
  store.clear();
  store.set(KEY, 'not-a-number');
  check('garbage does not unlock', !isUnlocked());
  store.set(KEY, '0');
  check('a zero timestamp does not unlock', !isUnlocked());
}

console.log('\n=== the unlock sequence itself ===');
{
  check('is not a real word anyone types', !/^[a-z]{1,4}$/.test(UNLOCK_SEQUENCE));
  check('is long enough to be deliberate', UNLOCK_SEQUENCE.length >= 6, UNLOCK_SEQUENCE);
  check('is lower case, so matching is predictable',
    UNLOCK_SEQUENCE === UNLOCK_SEQUENCE.toLowerCase());
}

// Re-implement the buffer rule the watcher uses, so the matching logic itself
// is covered without needing a DOM.
function wouldUnlock(keys, { pauseBefore = -1 } = {}) {
  let buffer = '';
  let last = 0;
  let now = 1000;
  let hit = false;
  keys.forEach((k, i) => {
    now += i === pauseBefore ? 5000 : 50;
    if (now - last > 2000) buffer = '';
    last = now;
    buffer = (buffer + k.toLowerCase()).slice(-UNLOCK_SEQUENCE.length);
    if (buffer === UNLOCK_SEQUENCE) { buffer = ''; hit = true; }
  });
  return hit;
}

console.log('\n=== matching ===');
{
  check('the exact sequence unlocks', wouldUnlock([...UNLOCK_SEQUENCE]));
  check('trailing junk after it still counted the hit',
    wouldUnlock([...UNLOCK_SEQUENCE, 'x', 'y']));
  check('the sequence typed mid-stream unlocks',
    wouldUnlock(['q', 'w', 'e', ...UNLOCK_SEQUENCE]));
  check('upper case still matches',
    wouldUnlock([...UNLOCK_SEQUENCE.toUpperCase()]));

  check('a partial sequence does not unlock',
    !wouldUnlock([...UNLOCK_SEQUENCE.slice(0, -1)]));
  check('the sequence scrambled does not unlock',
    !wouldUnlock([...UNLOCK_SEQUENCE].reverse()));
  check('a long pause mid-sequence resets it',
    !wouldUnlock([...UNLOCK_SEQUENCE], { pauseBefore: 3 }));

  // the realistic false-positive risk: an author typing a word list
  const words = 'elephant giraffe dolphin penguin tiger zebra monkey rabbit horse';
  check('typing a word list never unlocks', !wouldUnlock([...words]));
  const clues = 'largest land mammal, spotted big cat, clever sea mammal';
  check('typing clues never unlocks', !wouldUnlock([...clues]));
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
