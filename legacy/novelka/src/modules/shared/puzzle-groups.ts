import * as fabric from 'fabric';

/**
 * REAL grouping for generated puzzles.
 *
 * Generators emit many loose, tagged objects per puzzle. On the live canvas we
 * wrap each puzzle's objects into a genuine `fabric.Group` so it behaves as one
 * unit everywhere — moves/scales as a whole, members are not individually
 * selectable, and the Layers panel shows one group row. The layout engines
 * temporarily flatten the groups (via `flattenPuzzleGroups`) to reposition the
 * members, then re-group.
 */

type Any = Record<string, unknown>;

/** The puzzle-unit tag generators stamp on every object they emit. */
export function unitKeyOf(o: fabric.FabricObject | null | undefined): string | null {
  if (!o) return null;
  const a = o as unknown as Any;
  return (
    (a.instanceId as string) ??
    (a.sudokuPuzzle as string) ??
    (a.wsPuzzle as string) ??
    (a.cwPuzzle as string) ??
    (a.mzPuzzle as string) ??
    (a.hwPuzzle as string) ??
    null
  );
}

export function moduleLabelOf(o: fabric.FabricObject): string {
  const a = o as unknown as Any;
  if (a.sudokuPuzzle || a.sudokuRole) return 'Sudoku';
  if (a.wsPuzzle || a.wsRole) return 'Word search';
  if (a.cwPuzzle || a.cwRole) return 'Crossword';
  if (a.mzPuzzle || a.mzRole) return 'Maze';
  if (a.hwPuzzle || a.hwRole) return 'Handwriting';
  return 'Puzzle';
}

const UNIT_TAGS = ['sudokuPuzzle', 'wsPuzzle', 'cwPuzzle', 'mzPuzzle', 'hwPuzzle', 'instanceId'];

/** Word search puzzles stay loose — their semantic-instance editor needs to
 *  select/recolour the individual letter, rule and bank objects directly, and
 *  it reads their page coordinates (which a real group would nest away). */
function isWordSearch(o: fabric.FabricObject): boolean {
  const a = o as unknown as Any;
  return !!(a.wsPuzzle || a.wsRole) || a.moduleId === 'wordsearch';
}

/** Wrap each puzzle's loose tagged objects into one real fabric.Group. */
export function groupPuzzleUnits(c: fabric.Canvas | fabric.StaticCanvas): number {
  const map = new Map<string, fabric.FabricObject[]>();
  for (const o of c.getObjects()) {
    if (isWordSearch(o)) continue;
    const key = unitKeyOf(o);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  let made = 0;
  for (const [, members] of map) {
    if (members.length < 2) continue;
    c.remove(...members);
    const g = new fabric.Group(members, {});
    const any = g as unknown as Any;
    any.elementType = 'puzzle';
    any.name = `${moduleLabelOf(members[0])} puzzle`;
    // Carry the unit tag onto the group so selection/layers treat it as one unit.
    for (const tag of UNIT_TAGS) {
      const v = (members[0] as unknown as Any)[tag];
      if (v) any[tag] = v;
    }
    c.add(g);
    made++;
  }
  if (made) c.requestRenderAll();
  return made;
}

/** Split real puzzle groups back into loose tagged objects (for layout). */
export function flattenPuzzleGroups(c: fabric.Canvas | fabric.StaticCanvas): number {
  let n = 0;
  const groups = [...c.getObjects()].filter((g) => g.type === 'group');
  for (const g of groups) {
    const children = (g as unknown as Any)._objects as fabric.FabricObject[] | undefined;
    if (!children?.length) continue;
    if (!children.some((ch) => !!unitKeyOf(ch))) continue;
    const items = (g as fabric.Group).removeAll();
    c.remove(g);
    items.forEach((o) => c.add(o));
    n++;
  }
  if (n) c.requestRenderAll();
  return n;
}
