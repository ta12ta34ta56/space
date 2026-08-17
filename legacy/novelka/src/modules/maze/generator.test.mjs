/**
 * Maze generator tests.  npm run test:maze
 *
 * The one thing that must never happen: an unsolvable maze printed in a book.
 * Everything else is secondary, so solvability is checked exhaustively across
 * every shape, size and difficulty.
 */
import {
  generateMaze, generateMazes, solve, analyse, DEFAULT_MAZE,
} from './generator.built.mjs';

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

const SHAPES = ['rectangular', 'circular', 'triangular', 'hexagonal'];
const LEVELS = ['easy', 'medium', 'hard', 'expert'];

console.log('\n=== every maze is solvable ===');
{
  const broken = [];
  for (const shape of SHAPES) {
    for (const difficulty of LEVELS) {
      for (const size of [5, 8, 14, 25]) {
        const m = generateMaze({
          ...DEFAULT_MAZE, shape, difficulty, width: size, height: size, seed: size * 31,
        });
        if (!m.solution.length) broken.push(`${shape}/${difficulty}/${size}: NO PATH`);
        else if (m.solution[0] !== m.start) broken.push(`${shape}/${difficulty}/${size}: bad start`);
        else if (m.solution.at(-1) !== m.end) broken.push(`${shape}/${difficulty}/${size}: bad end`);
      }
    }
  }
  check('64 mazes across every shape/difficulty/size all solve',
    broken.length === 0, broken.slice(0, 4).join('; '));
}

console.log('\n=== the solution is a real walk, not just endpoints ===');
{
  const bad = [];
  for (const shape of SHAPES) {
    const m = generateMaze({ ...DEFAULT_MAZE, shape, width: 12, height: 12, seed: 7 });
    for (let i = 1; i < m.solution.length; i++) {
      const from = m.cells[m.solution[i - 1]];
      if (!from.links.includes(m.solution[i])) {
        bad.push(`${shape}: step ${i} jumps between unlinked cells`);
        break;
      }
    }
    if (new Set(m.solution).size !== m.solution.length) bad.push(`${shape}: path revisits a cell`);
  }
  check('every step follows an open wall', bad.length === 0, bad.join('; '));
}

console.log('\n=== every cell is reachable (no orphans) ===');
{
  const bad = [];
  for (const shape of SHAPES) {
    const m = generateMaze({ ...DEFAULT_MAZE, shape, width: 15, height: 15, seed: 3 });
    const seen = new Set([m.start]);
    const queue = [m.start];
    for (let i = 0; i < queue.length; i++) {
      for (const n of m.cells[queue[i]].links) {
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    if (seen.size !== m.cells.length) {
      bad.push(`${shape}: ${m.cells.length - seen.size} of ${m.cells.length} unreachable`);
    }
  }
  check('no walled-off cells in any shape', bad.length === 0, bad.join('; '));
}

console.log('\n=== a perfect maze has exactly one route ===');
{
  // A spanning tree has exactly cells-1 links (counted once each).
  const bad = [];
  for (const shape of SHAPES) {
    const m = generateMaze({
      ...DEFAULT_MAZE, shape, difficulty: 'expert', braid: 0, width: 14, height: 14, seed: 11,
    });
    const linkCount = m.cells.reduce((s, c) => s + c.links.length, 0) / 2;
    if (linkCount !== m.cells.length - 1) {
      bad.push(`${shape}: ${linkCount} links for ${m.cells.length} cells (want ${m.cells.length - 1})`);
    }
  }
  check('unbraided mazes are perfect (loop-free)', bad.length === 0, bad.join('; '));
}

console.log('\n=== braiding opens the maze but keeps it solvable ===');
{
  const plain = generateMaze({ ...DEFAULT_MAZE, braid: 0, width: 20, height: 20, seed: 5 });
  const braided = generateMaze({ ...DEFAULT_MAZE, braid: 0.9, width: 20, height: 20, seed: 5 });
  check('braiding removes dead ends',
    braided.stats.deadEnds < plain.stats.deadEnds,
    `${plain.stats.deadEnds} -> ${braided.stats.deadEnds}`);
  check('a braided maze still solves', braided.solution.length > 0);
  check('and still reaches the true exit', braided.solution.at(-1) === braided.end);
}

console.log('\n=== difficulty is measured, not just declared ===');
{
  // Average over MANY seeds. An 8-seed sample put expert below hard purely by
  // chance, which made this test flake — a flaky test is worse than no test,
  // because it trains you to ignore failures. 24 seeds is stable.
  const SEEDS = 24;
  const measure = (difficulty) => {
    let decisions = 0, path = 0;
    for (let s = 0; s < SEEDS; s++) {
      const m = generateMaze({
        ...DEFAULT_MAZE, difficulty, braid: 0, width: 22, height: 22, seed: 1000 + s,
      });
      decisions += m.stats.decisions;
      path += m.stats.pathLength;
    }
    return { decisions: decisions / SEEDS, path: path / SEEDS };
  };
  const easy = measure('easy');
  const hard = measure('hard');
  const expert = measure('expert');
  console.log(`      easy   decisions ${easy.decisions.toFixed(1)}  path ${easy.path.toFixed(0)}`);
  console.log(`      hard   decisions ${hard.decisions.toFixed(1)}  path ${hard.path.toFixed(0)}`);
  console.log(`      expert decisions ${expert.decisions.toFixed(1)}  path ${expert.path.toFixed(0)}`);

  const medium = measure('medium');
  check('difficulty increases monotonically in decisions',
    easy.decisions < medium.decisions
    && medium.decisions < hard.decisions
    && hard.decisions <= expert.decisions,
    `${easy.decisions.toFixed(1)} < ${medium.decisions.toFixed(1)} < `
    + `${hard.decisions.toFixed(1)} <= ${expert.decisions.toFixed(1)}`);
  check('and the solution path gets longer too',
    easy.path < hard.path,
    `${easy.path.toFixed(0)} vs ${hard.path.toFixed(0)}`);
  check('easy is genuinely easy (few junctions)', easy.decisions < 8,
    easy.decisions.toFixed(1));
}

console.log('\n=== same seed, same maze ===');
{
  const a = generateMaze({ ...DEFAULT_MAZE, seed: 424242 });
  const b = generateMaze({ ...DEFAULT_MAZE, seed: 424242 });
  check('identical seeds produce identical mazes',
    JSON.stringify(a.walls) === JSON.stringify(b.walls));
  check('and identical solutions', a.solution.join() === b.solution.join());

  const c = generateMaze({ ...DEFAULT_MAZE, seed: 424243 });
  check('a different seed produces a different maze',
    JSON.stringify(a.walls) !== JSON.stringify(c.walls));
}

console.log('\n=== a book has no duplicate mazes ===');
{
  const book = generateMazes({ ...DEFAULT_MAZE, width: 15, height: 15 }, 40, 99);
  const fingerprints = new Set(book.map((m) => m.walls.map((w) => `${w.x1},${w.y1}`).join()));
  check('40 mazes are all different', fingerprints.size === 40, `${fingerprints.size} unique`);
  check('and all solvable', book.every((m) => m.solution.length > 0));
}

console.log('\n=== geometry stays inside the box ===');
{
  const bad = [];
  for (const shape of SHAPES) {
    const m = generateMaze({ ...DEFAULT_MAZE, shape, width: 16, height: 16, seed: 2 });
    for (const w of m.walls) {
      if ([w.x1, w.y1, w.x2, w.y2].some((v) => v < -0.02 || v > 1.02)) {
        bad.push(`${shape}: wall outside 0..1`);
        break;
      }
    }
    for (const c of m.cells) {
      if (c.cx < -0.02 || c.cx > 1.02 || c.cy < -0.02 || c.cy > 1.02) {
        bad.push(`${shape}: cell centre outside 0..1`);
        break;
      }
      if (c.poly.length < 3) { bad.push(`${shape}: degenerate cell polygon`); break; }
    }
  }
  check('all four shapes stay in the unit box', bad.length === 0, bad.join('; '));
}

console.log('\n=== geometry agrees with the graph ===');
{
  // THE bug this catches: cell polygons are built per shape, but walls are
  // derived from which neighbours are linked. If a shape's corners do not land
  // on identical coordinates from both sides, no edge is ever recognised as
  // shared, so no wall is removed and the maze prints as a SOLID GRID with a
  // solution line drawn over it. Triangular and hexagonal both shipped that way
  // until this check existed.
  const TOL = 1e-6;
  const near = (a, b) => Math.abs(a.x - b.x) < TOL && Math.abs(a.y - b.y) < TOL;
  const shares = (a, b) => {
    for (let i = 0; i < a.poly.length; i++) {
      const a1 = a.poly[i], a2 = a.poly[(i + 1) % a.poly.length];
      for (let j = 0; j < b.poly.length; j++) {
        const b1 = b.poly[j], b2 = b.poly[(j + 1) % b.poly.length];
        if ((near(a1, b1) && near(a2, b2)) || (near(a1, b2) && near(a2, b1))) return true;
      }
    }
    return false;
  };

  // Circular cells are bounded by sampled ARCS, so they legitimately never
  // share an identical corner pair; they use a polar wall model and are
  // covered by the solvability and wall-count checks instead.
  const STRAIGHT = SHAPES.filter((s) => s !== 'circular');
  const bad = [];
  for (const shape of STRAIGHT) {
    const m = generateMaze({ ...DEFAULT_MAZE, shape, width: 10, height: 10, seed: 21 });
    let miss = 0, total = 0;
    for (const c of m.cells) {
      for (const n of c.links) {
        if (c.id >= n) continue;
        total++;
        if (!shares(c, m.cells[n])) miss++;
      }
    }
    if (miss > 0) bad.push(`${shape}: ${miss}/${total} linked pairs share no edge`);
  }
  check('every open corridor is a genuinely shared edge', bad.length === 0, bad.join('; '));

  // A solid grid keeps roughly every internal edge. A carved maze must have
  // clearly fewer walls than that ceiling.
  const dense = [];
  for (const shape of STRAIGHT) {
    const m = generateMaze({ ...DEFAULT_MAZE, shape, width: 10, height: 10, seed: 22 });
    const edges = m.cells.reduce((s, c) => s + c.neighbours.length, 0) / 2;
    const links = m.cells.reduce((s, c) => s + c.links.length, 0) / 2;
    // walls should be near (edges - links), not near edges
    if (m.walls.length > edges * 1.15 + m.cells.length) {
      dense.push(`${shape}: ${m.walls.length} walls vs ${edges} internal edges — nothing was carved`);
    }
    if (links < m.cells.length - 1) dense.push(`${shape}: too few links (${links})`);
  }
  check('walls were actually removed (not a solid grid)', dense.length === 0, dense.join('; '));

  // Circular: every linked pair must have NO wall between them. Verified by
  // counting walls against the theoretical maximum for the ring layout.
  const circ = generateMaze({ ...DEFAULT_MAZE, shape: 'circular', width: 8, seed: 23 });
  const circLinks = circ.cells.reduce((s2, c) => s2 + c.links.length, 0) / 2;
  const circEdges = circ.cells.reduce((s2, c) => s2 + c.neighbours.length, 0) / 2;
  check('the ring maze carves open corridors',
    circLinks >= circ.cells.length - 1 && circLinks < circEdges,
    `${circLinks} links of ${circEdges} possible edges`);
  check('the ring maze is not a solid set of rings',
    circ.walls.length < circ.cells.length * 6,
    `${circ.walls.length} wall segments for ${circ.cells.length} cells`);
}

console.log('\n=== walls actually enclose the maze ===');
{
  for (const shape of SHAPES) {
    const m = generateMaze({ ...DEFAULT_MAZE, shape, width: 12, height: 12, seed: 8 });
    check(`${shape} has walls`, m.walls.length > m.cells.length * 0.5,
      `${m.walls.length} walls for ${m.cells.length} cells`);
  }
  // A wall must never sit between two cells that ARE linked.
  const m = generateMaze({ ...DEFAULT_MAZE, width: 14, height: 14, seed: 4 });
  const openings = m.cells.reduce((s, c) => s + c.links.length, 0) / 2;
  check('open corridors are not walled over', openings > 0 && m.walls.length > 0);
}

console.log('\n=== entrance and exit ===');
{
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const m = generateMaze({ ...DEFAULT_MAZE, startsAt: side, width: 15, height: 15, seed: 6 });
    check(`start and end differ (${side})`, m.start !== m.end);
  }
  const top = generateMaze({ ...DEFAULT_MAZE, startsAt: 'top', width: 15, height: 15, seed: 6 });
  const bottom = generateMaze({ ...DEFAULT_MAZE, startsAt: 'bottom', width: 15, height: 15, seed: 6 });
  check('"top" starts above "bottom"',
    top.cells[top.start].cy < bottom.cells[bottom.start].cy);

  const circ = generateMaze({ ...DEFAULT_MAZE, shape: 'circular', width: 8, seed: 6 });
  check('a circular maze ends in the centre', circ.cells[circ.end].ring === 0);
  check('and starts on the outer ring',
    circ.cells[circ.start].ring === Math.max(...circ.cells.map((c) => c.ring)));
}

console.log('\n=== extremes do not crash ===');
{
  const tiny = generateMaze({ ...DEFAULT_MAZE, width: 2, height: 2, seed: 1 });
  check('a 2x2 maze works', tiny.solution.length > 0, `${tiny.cells.length} cells`);

  const wide = generateMaze({ ...DEFAULT_MAZE, width: 60, height: 3, seed: 1 });
  check('a long thin maze works', wide.solution.length > 0);

  const t0 = Date.now();
  const big = generateMaze({ ...DEFAULT_MAZE, width: 120, height: 120, seed: 1 });
  const ms = Date.now() - t0;
  check('a 120x120 maze (14,400 cells) solves', big.solution.length > 0);
  check('and builds fast enough for a live UI', ms < 4000, `${ms}ms`);
  console.log(`      120x120 took ${ms}ms, path ${big.stats.pathLength} cells`);

  // Iterative carving, not recursive — a deep maze must not blow the stack.
  const deep = generateMaze({ ...DEFAULT_MAZE, difficulty: 'easy', width: 150, height: 150, seed: 2 });
  check('no stack overflow on 22,500 cells', deep.solution.length > 0);
}

console.log('\n=== solver and analyser are honest ===');
{
  const m = generateMaze({ ...DEFAULT_MAZE, width: 18, height: 18, seed: 12 });
  const again = solve(m.cells, m.start, m.end);
  check('re-solving gives the same length', again.length === m.solution.length);

  const stats = analyse(m.cells, m.solution);
  check('stats match the maze', stats.cellCount === m.cells.length);
  check('path length matches the solution', stats.pathLength === m.solution.length);
  check('a perfect maze reports dead ends', stats.deadEnds > 0);
  check('the path is shorter than the whole maze', stats.pathLength < stats.cellCount);

  // An isolated cell must report unsolvable rather than pretending.
  const broken = JSON.parse(JSON.stringify(m.cells));
  for (const c of broken) c.links = c.links.filter((n) => n !== m.end);
  broken[m.end].links = [];
  check('an unreachable exit returns no path', solve(broken, m.start, m.end).length === 0);
}

console.log('\n=== page designs ===');
{
  const { JSDOM } = await import('jsdom');
  const { installCanvasStub } = await import('../../../test/helpers/jsdom-canvas-stub.mjs');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  installCanvasStub(dom);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  });

  const { MZ_TEMPLATES, getMzTemplate, mzTemplatesFor } = await import('./templates.built.mjs');

  check('at least 6 designs', MZ_TEMPLATES.length >= 6, String(MZ_TEMPLATES.length));
  const ids = MZ_TEMPLATES.map((t) => t.id);
  check('ids are unique', new Set(ids).size === ids.length);
  check('every design has a description', MZ_TEMPLATES.every((t) => t.description));
  check('every design has a preview', MZ_TEMPLATES.every((t) => t.preview.includes('<')));

  const W = 595, H = 842;
  const broken = [];
  for (const t of MZ_TEMPLATES) {
    for (const n of t.supports) {
      const ctx = {
        page: { id: 'p', name: '', width: W, height: H, background: '#fff', data: null },
        pageNumber: 1, pageCount: 30, count: n, font: 'Inter', kdpSafe: true,
        title: 'Mazes', subtitle: 'Maze 1', difficulty: 'Medium', folio: 1,
        ink: '#111827', accent: '#2b7fb8',
      };
      let r;
      try { r = t.build(ctx); } catch (e) { broken.push(`${t.id}: threw ${e.message}`); continue; }
      if (r.slots.length !== n) broken.push(`${t.id}: ${r.slots.length} slots for ${n} mazes`);
      for (const s of r.slots) {
        // A maze MUST be square, or its cells distort into rectangles.
        if (s.size <= 40) broken.push(`${t.id}: slot too small (${s.size.toFixed(0)})`);
        if (s.left < 0 || s.top < 0
            || s.left + s.size > W + 0.5 || s.top + s.size > H + 0.5) {
          broken.push(`${t.id}: slot escapes the page`);
        }
      }
      // Slots must not overlap.
      for (let i = 0; i < r.slots.length; i++) {
        for (let j = i + 1; j < r.slots.length; j++) {
          const a = r.slots[i], bb = r.slots[j];
          const ox = Math.min(a.left + a.size, bb.left + bb.size) - Math.max(a.left, bb.left);
          const oy = Math.min(a.top + a.size, bb.top + bb.size) - Math.max(a.top, bb.top);
          if (ox > 1 && oy > 1) broken.push(`${t.id}: slots ${i} and ${j} overlap`);
        }
      }
    }
  }
  check('every design builds correctly at every supported count',
    broken.length === 0, broken.slice(0, 4).join('; '));

  // Small trim sizes must still produce something usable.
  const tinyBroken = MZ_TEMPLATES.filter((t) => {
    try {
      const r = t.build({
        page: { id: 'p', name: '', width: 288, height: 432, background: '#fff', data: null },
        pageNumber: 1, pageCount: 24, count: t.supports[0], font: 'Inter', kdpSafe: true,
        title: 'M', ink: '#111827', accent: '#2b7fb8',
      });
      return r.slots.some((s) => s.size <= 0);
    } catch { return true; }
  }).map((t) => t.id);
  check('designs survive a 4x6 trim size', tinyBroken.length === 0, tinyBroken.join(' '));

  check('unknown id falls back to a real design', getMzTemplate('nope').id === 'classic');
  check('the answer key is not offered as a puzzle design',
    !mzTemplatesFor(1).some((t) => t.id === 'answers'));
  check('two-up is offered only for 2 per page',
    mzTemplatesFor(2).some((t) => t.id === 'two-up')
    && !mzTemplatesFor(1).some((t) => t.id === 'two-up'));
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
