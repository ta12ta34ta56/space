/**
 * Example words for each letter.
 *
 * Chosen against three rules, because the wrong word actively teaches badly:
 *
 *  1. **The letter must make its usual sound.** `C is for Circle` is a trap —
 *     a child learning `C` says /k/. So: Cat, not Circle. `G is for Giraffe`
 *     is soft-G; Goat is right.
 *  2. **Concrete and drawable.** A child illustrates these, so every word is a
 *     thing you can picture. No "Amazing", no "Under".
 *  3. **Short and common.** One or two syllables, in a four-year-old's world.
 *
 * Several options per letter so a 26-page book can vary, and so the user can
 * pick a different word if ours does not suit their theme.
 */

export interface LetterWords {
  /** the safest default — correct sound, universally known, easy to draw */
  primary: string;
  alternates: string[];
}

export const WORD_BANK: Record<string, LetterWords> = {
  A: { primary: 'Apple', alternates: ['Ant', 'Axe', 'Alligator', 'Arrow'] },
  B: { primary: 'Ball', alternates: ['Bear', 'Bird', 'Bus', 'Boat'] },
  // hard C only — Circle and City would teach the wrong sound
  C: { primary: 'Cat', alternates: ['Cake', 'Cow', 'Car', 'Cup'] },
  D: { primary: 'Dog', alternates: ['Duck', 'Door', 'Drum', 'Doll'] },
  E: { primary: 'Egg', alternates: ['Elephant', 'Envelope', 'Engine'] },
  F: { primary: 'Fish', alternates: ['Frog', 'Fox', 'Flower', 'Fan'] },
  // hard G only — Giraffe is soft
  G: { primary: 'Goat', alternates: ['Gate', 'Grapes', 'Gift', 'Girl'] },
  H: { primary: 'Hat', alternates: ['House', 'Horse', 'Hand', 'Heart'] },
  // short I — Ice cream is a long-I trap
  I: { primary: 'Igloo', alternates: ['Insect', 'Ink', 'Iguana'] },
  J: { primary: 'Jam', alternates: ['Jug', 'Jet', 'Jacket', 'Jelly'] },
  K: { primary: 'Kite', alternates: ['Key', 'King', 'Koala', 'Kitten'] },
  L: { primary: 'Leaf', alternates: ['Lion', 'Lamp', 'Log', 'Ladder'] },
  M: { primary: 'Moon', alternates: ['Mouse', 'Milk', 'Map', 'Monkey'] },
  N: { primary: 'Nest', alternates: ['Nose', 'Net', 'Nut', 'Nurse'] },
  O: { primary: 'Owl', alternates: ['Orange', 'Octopus', 'Ostrich'] },
  P: { primary: 'Pig', alternates: ['Pen', 'Pot', 'Panda', 'Pear'] },
  Q: { primary: 'Queen', alternates: ['Quilt', 'Question', 'Quail'] },
  R: { primary: 'Rain', alternates: ['Rabbit', 'Ring', 'Robot', 'Rose'] },
  S: { primary: 'Sun', alternates: ['Star', 'Snake', 'Sock', 'Ship'] },
  T: { primary: 'Tree', alternates: ['Tiger', 'Train', 'Table', 'Top'] },
  U: { primary: 'Umbrella', alternates: ['Up', 'Uncle'] },
  V: { primary: 'Van', alternates: ['Violin', 'Vase', 'Volcano', 'Vest'] },
  W: { primary: 'Web', alternates: ['Whale', 'Window', 'Watch', 'Worm'] },
  X: { primary: 'Box', alternates: ['Fox', 'Six', 'X-ray'] },
  Y: { primary: 'Yarn', alternates: ['Yo-yo', 'Yak', 'Yellow'] },
  Z: { primary: 'Zebra', alternates: ['Zip', 'Zoo', 'Zero'] },
};

/**
 * `X` is the honest exception.
 *
 * Almost nothing a child knows *starts* with X, and the few that do (xylophone,
 * x-ray) are misleading — xylophone starts with a /z/ sound. Teachers use words
 * that *end* in X instead, which is why the bank offers Box and Fox.
 */
export const X_IS_TERMINAL = true;

export const NUMBER_WORDS: Record<string, string> = {
  '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four',
  '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine',
};

/** Best example word for a character. */
export function wordFor(ch: string, index = 0): string {
  const upper = ch.toUpperCase();
  if (NUMBER_WORDS[upper]) return NUMBER_WORDS[upper];
  const entry = WORD_BANK[upper];
  if (!entry) return '';
  if (index <= 0) return entry.primary;
  const all = [entry.primary, ...entry.alternates];
  return all[index % all.length];
}

/** Every option for a character, for the "change the word" picker. */
export function wordsFor(ch: string): string[] {
  const upper = ch.toUpperCase();
  if (NUMBER_WORDS[upper]) return [NUMBER_WORDS[upper]];
  const entry = WORD_BANK[upper];
  return entry ? [entry.primary, ...entry.alternates] : [];
}

/**
 * The phrase under the big letter.
 *
 * X gets different wording because "X is for Box" is simply wrong.
 */
export function phraseFor(ch: string, word: string): string {
  const upper = ch.toUpperCase();
  if (upper === 'X' && X_IS_TERMINAL && !word.toUpperCase().startsWith('X')) {
    return `${word} ends with ${ch}`;
  }
  return `${ch} is for ${word}`;
}
