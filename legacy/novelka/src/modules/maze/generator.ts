import { makeRng } from '../shared/puzzle-utils';

/**
 * Maze generator.
 *
 * ## Why a graph, not a grid of booleans
 *
 * Every shape here — rectangular, circular, triangular, hexagonal — is the same
 * thing underneath: cells joined by walls. Modelling that as a general graph
 * means one carving algorithm, one solver and one difficulty metric serve all
 * four shapes. A per-shape implementation would need four of each and would
 * drift out of agreement.
 *
 * ## Guarantees
 *
 * Randomised depth-first search over a spanning tree gives a **perfect maze**:
 * exactly one path between any two cells, no loops, no unreachable cells. Every
 * maze therefore has a solution, and it is unique. That is asserted in tests
 * rather than assumed — an unsolvable maze printed in a book is unfixable.
 *
 * Braiding (`loops > 0`) deliberately breaks perfection by removing dead ends,
 * which creates multiple routes. The solver still runs afterwards, so
 * solvability is re-proven for braided mazes too.
 */

export type MazeShape = 'rectangular' | 'circular' | 'triangular' | 'hexagonal';
export type MazeDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

/** Polar bounds of a ring cell, for circular mazes. */
export interface PolarBounds {
  a0: number;
  a1: number;
  inner: number;
  outer: number;
  index: number;
  count: number;
}

export interface Cell {
  id: number;
  /** neighbour ids, in shape-specific order */
  neighbours: number[];
  /** neighbour ids this cell is actually joined to */
  links: number[];
  /** drawing geometry, in a 0..1 box */
  cx: number;
  cy: number;
  /** polygon outline of the cell, for shapes that need it */
  poly: { x: number; y: number }[];
  /** ring / row index, used for entrance placement */
  ring: number;
  /** present only on circular mazes */
  polar?: PolarBounds;
}

export interface Maze {
  shape: MazeShape;
  cells: Cell[];
  /** entrance and exit cell ids */
  start: number;
  end: number;
  /** the unique (or shortest) path from start to end */
  solution: number[];
  /** walls to draw: pairs of points in a 0..1 box */
  walls: { x1: number; y1: number; x2: number; y2: number }[];
  seed: number;
  difficulty: MazeDifficulty;
  /** measured, not declared — see `analyse` */
  stats: MazeStats;
}

export interface MazeStats {
  cellCount: number;
  /** cells on the solution path */
  pathLength: number;
  /** cells with exactly one link */
  deadEnds: number;
  /** how many junctions the solver must choose at */
  decisions: number;
  /** longest wrong turn before it dead-ends */
  worstDetour: number;
}

export interface MazeOptions {
  shape: MazeShape;
  /** columns, or rings for circular */
  width: number;
  /** rows; ignored for circular */
  height: number;
  difficulty: MazeDifficulty;
  seed?: number;
  /**
   * 0 = perfect maze (one solution).
   * >0 removes that fraction of dead ends, creating loops and alternate routes.
   */
  braid: number;
  /** entrance side */
  startsAt: 'top' | 'bottom' | 'left' | 'right' | 'centre';
}

export const DEFAULT_MAZE: MazeOptions = {
  shape: 'rectangular',
  width: 20,
  height: 20,
  difficulty: 'medium',
  braid: 0,
  startsAt: 'top',
};

/**
 * Difficulty is a *bias*, not a size.
 *
 * A big maze is not automatically hard — a 40x40 with long straight corridors
 * is easier than a 15x15 that branches at every step. What makes a maze hard is
 * how often you must choose, and how far a wrong choice takes you.
 *
 * `straightness` biases the carver toward continuing in the same direction.
 * High values make long corridors and few junctions (easy). Low values make it
 * turn constantly, producing many short branches (hard).
 */
/**
 * Values measured, not guessed.
 *
 * Sweeping straightness against junction count on 22x22 mazes (12 seeds each):
 *
 *   0.00 -> 12.1 decisions    0.30 ->  9.7
 *   0.08 -> 13.9  (peak)      0.45 ->  9.5
 *   0.15 -> 13.0              0.60 ->  8.0
 *   0.22 -> 12.6              0.80 ->  3.8
 *
 * The surprise is that **fully random (0.0) is not the hardest**. With no bias
 * the carver backtracks more, producing longer unbranched corridors; a slight
 * bias keeps it weaving through open ground and creates more junctions. Expert
 * was originally 0.0 and measured *easier* than hard, which the monotonicity
 * test caught.
 *
 * Expert additionally uses a longer solution path via `expertPass`.
 */
const DIFFICULTY: Record<MazeDifficulty, { straightness: number; braid: number }> = {
  easy: { straightness: 0.80, braid: 0.25 },
  medium: { straightness: 0.35, braid: 0.05 },
  hard: { straightness: 0.15, braid: 0 },
  // Expert uses the same carve as hard; its extra difficulty comes from
  // `farthestPair` choosing the two cells with the longest path between them.
  expert: { straightness: 0.12, braid: 0 },
};

// ------------------------------------------------------------ shape builders

/** Rectangular grid. Neighbours in N, E, S, W order. */
function buildRectangular(w: number, h: number): Cell[] {
  const cells: Cell[] = [];
  const idx = (c: number, r: number) => r * w + c;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const n: number[] = [];
      if (r > 0) n.push(idx(c, r - 1));
      if (c < w - 1) n.push(idx(c + 1, r));
      if (r < h - 1) n.push(idx(c, r + 1));
      if (c > 0) n.push(idx(c - 1, r));
      const x0 = c / w, y0 = r / h, x1 = (c + 1) / w, y1 = (r + 1) / h;
      cells.push({
        id: idx(c, r), neighbours: n, links: [],
        cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
        poly: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
        ring: r,
      });
    }
  }
  return cells;
}

/**
 * Concentric-ring (theta) maze.
 *
 * Each ring holds twice as many cells as the one inside it once the cells get
 * too wide, which keeps every cell roughly square. Without that subdivision the
 * outer rings become long thin slivers that are unpleasant to draw and to
 * solve.
 */
function buildCircular(rings: number, innerHole: number): Cell[] {
  const cells: Cell[] = [];
  const counts: number[] = [];
  let count = 1;

  for (let r = 0; r < rings; r++) {
    if (r === 0) {
      count = innerHole > 0 ? 8 : 1;
    } else {
      const radius = r + innerHole;
      const cellWidth = (2 * Math.PI * radius) / count;
      // subdivide when a cell grows wider than it is tall
      if (cellWidth > 1.6) count *= 2;
    }
    counts.push(count);
  }

  const ringStart: number[] = [];
  let running = 0;
  for (const c of counts) { ringStart.push(running); running += c; }

  const total = rings + innerHole;
  for (let r = 0; r < rings; r++) {
    const n = counts[r];
    const inner = (r + innerHole) / total * 0.5;
    const outer = (r + 1 + innerHole) / total * 0.5;

    for (let i = 0; i < n; i++) {
      const id = ringStart[r] + i;
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
      const neighbours: number[] = [];

      // clockwise / anticlockwise within the ring
      if (n > 1) {
        neighbours.push(ringStart[r] + ((i + 1) % n));
        neighbours.push(ringStart[r] + ((i - 1 + n) % n));
      }
      // inward
      if (r > 0) {
        const ratio = counts[r] / counts[r - 1];
        neighbours.push(ringStart[r - 1] + Math.floor(i / ratio));
      }
      // outward
      if (r < rings - 1) {
        const ratio = counts[r + 1] / counts[r];
        for (let k = 0; k < ratio; k++) {
          neighbours.push(ringStart[r + 1] + i * ratio + k);
        }
      }

      const mid = (a0 + a1) / 2;
      const midR = (inner + outer) / 2;
      const arc = (radius: number, from: number, to: number) => {
        const pts: { x: number; y: number }[] = [];
        const steps = Math.max(2, Math.ceil((Math.abs(to - from) * radius) * 40));
        for (let s = 0; s <= steps; s++) {
          const a = from + ((to - from) * s) / steps;
          pts.push({ x: 0.5 + Math.cos(a) * radius, y: 0.5 + Math.sin(a) * radius });
        }
        return pts;
      };

      const cell: Cell = {
        id, neighbours, links: [],
        cx: 0.5 + Math.cos(mid) * midR,
        cy: 0.5 + Math.sin(mid) * midR,
        poly: [...arc(inner, a0, a1), ...arc(outer, a1, a0)],
        ring: r,
      };
      // Polar description, used instead of polygon matching for walls: two
      // ring cells are bounded by ARCS sampled into many points, so they never
      // share an identical corner pair.
      (cell as Cell & { polar?: PolarBounds }).polar = {
        a0, a1, inner, outer, index: i, count: n,
      };
      cells.push(cell);
    }
  }
  return cells;
}

/**
 * Triangular grid of alternating up and down triangles.
 *
 * Row r holds 2r+1 triangles: r+1 pointing up, r pointing down, interleaved.
 * The geometry must be derived from a single half-step so that an up-triangle
 * and the down-triangle beside it share two identical corners.
 *
 * The first version computed each triangle's x from `Math.floor(i / 2)` over a
 * per-row width, which drifted: not one linked pair actually shared an edge, so
 * no wall was ever removed and the maze printed as a solid lattice.
 *
 * Here every corner is a multiple of `half`, computed the same way from both
 * sides, so shared corners are bit-identical.
 */
function buildTriangular(size: number): Cell[] {
  const cells: Cell[] = [];
  const rowStart: number[] = [];
  let running = 0;
  for (let r = 0; r < size; r++) { rowStart.push(running); running += 2 * r + 1; }

  const H = 1 / size;            // row height
  const half = 1 / (2 * size);   // half the base of one triangle

  for (let r = 0; r < size; r++) {
    const n = 2 * r + 1;
    const y0 = r * H;
    const y1 = (r + 1) * H;
    // Left edge of this row, so the triangle sits centred in the unit box.
    const rowLeft = 0.5 - (r + 1) * half;

    for (let i = 0; i < n; i++) {
      const id = rowStart[r] + i;
      const up = i % 2 === 0;

      const neighbours: number[] = [];
      if (i > 0) neighbours.push(id - 1);
      if (i < n - 1) neighbours.push(id + 1);
      // An up-triangle touches the row below; a down-triangle touches above.
      if (up && r < size - 1) neighbours.push(rowStart[r + 1] + i + 1);
      if (!up && r > 0) neighbours.push(rowStart[r - 1] + i - 1);

      // Both orientations span the same two half-steps, which is what makes
      // adjacent triangles share exactly two corners.
      const xl = rowLeft + i * half;
      const xr = xl + 2 * half;
      const xm = xl + half;

      const poly = up
        ? [{ x: xm, y: y0 }, { x: xr, y: y1 }, { x: xl, y: y1 }]
        : [{ x: xl, y: y0 }, { x: xr, y: y0 }, { x: xm, y: y1 }];

      const cx = (poly[0].x + poly[1].x + poly[2].x) / 3;
      const cy = (poly[0].y + poly[1].y + poly[2].y) / 3;

      cells.push({ id, neighbours, links: [], cx, cy, poly, ring: r });
    }
  }
  return cells;
}

/**
 * Hexagonal grid, pointy-top, offset rows.
 *
 * Spacing must come from the hexagon's own radius, not the other way round.
 * The first version chose a column pitch and then drew hexagons sized
 * independently, so neighbours sat 0.0298 apart and shared no edges at all —
 * every wall survived and the maze printed as a solid honeycomb.
 *
 * For a pointy-top hex of circumradius R:
 *   width  = sqrt(3) * R        horizontal pitch, and the offset is half that
 *   height = 2 * R              vertical pitch is 3/4 of that
 */
function buildHexagonal(w: number, h: number): Cell[] {
  const cells: Cell[] = [];
  const idx = (c: number, r: number) => r * w + c;

  // Fit the grid into the unit box: solve for R from whichever axis binds.
  const rFromW = 1 / (Math.sqrt(3) * (w + 0.5));
  const rFromH = 1 / (2 + 1.5 * (h - 1));
  const R = Math.min(rFromW, rFromH);
  const pitchX = Math.sqrt(3) * R;
  const pitchY = 1.5 * R;

  const gridW = pitchX * (w + 0.5);
  const gridH = 2 * R + pitchY * (h - 1);
  const offX = (1 - gridW) / 2;
  const offY = (1 - gridH) / 2;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const odd = r % 2 === 1;
      const neighbours: number[] = [];
      const push = (cc: number, rr: number) => {
        if (cc >= 0 && cc < w && rr >= 0 && rr < h) neighbours.push(idx(cc, rr));
      };
      push(c - 1, r); push(c + 1, r);
      if (odd) {
        push(c, r - 1); push(c + 1, r - 1);
        push(c, r + 1); push(c + 1, r + 1);
      } else {
        push(c - 1, r - 1); push(c, r - 1);
        push(c - 1, r + 1); push(c, r + 1);
      }

      const cx = offX + pitchX * (c + (odd ? 1 : 0.5));
      const cy = offY + R + pitchY * r;

      // Pointy-top: first vertex straight up, then every 60 degrees. Corners
      // are computed from the SAME R and pitch as the spacing, so adjacent
      // hexagons land on identical coordinates and genuinely share an edge.
      const poly = Array.from({ length: 6 }, (_, k) => {
        const a = (Math.PI / 3) * k - Math.PI / 2;
        return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
      });

      cells.push({ id: idx(c, r), neighbours, links: [], cx, cy, poly, ring: r });
    }
  }
  return cells;
}

// ---------------------------------------------------------------- carving

/**
 * Randomised depth-first search with a straightness bias.
 *
 * Iterative, not recursive: a 200x200 maze is 40,000 cells and would blow the
 * call stack.
 */
function carve(cells: Cell[], rng: () => number, straightness: number) {
  const visited = new Uint8Array(cells.length);
  const stack: number[] = [0];
  visited[0] = 1;
  let lastDir = -1;

  while (stack.length) {
    const current = stack[stack.length - 1];
    const cell = cells[current];
    const options = cell.neighbours.filter((n) => !visited[n]);

    if (!options.length) {
      stack.pop();
      lastDir = -1;
      continue;
    }

    // Bias toward keeping the same neighbour index, which for a grid means
    // carrying on in the same compass direction — that is what makes long
    // corridors on easy settings.
    let pick: number;
    const sameDir = lastDir >= 0 ? cell.neighbours[lastDir] : undefined;
    if (sameDir !== undefined && !visited[sameDir] && rng() < straightness) {
      pick = sameDir;
    } else {
      pick = options[Math.floor(rng() * options.length)];
    }

    lastDir = cell.neighbours.indexOf(pick);
    cell.links.push(pick);
    cells[pick].links.push(current);
    visited[pick] = 1;
    stack.push(pick);
  }
}

/**
 * Remove a fraction of dead ends by opening one extra wall each.
 *
 * This is what makes a maze feel "open". It also destroys uniqueness, which is
 * why the solver runs afterwards rather than trusting the tree.
 */
function braid(cells: Cell[], rng: () => number, fraction: number) {
  if (fraction <= 0) return;
  const deadEnds = cells.filter((c) => c.links.length === 1);
  for (const cell of deadEnds) {
    if (rng() > fraction) continue;
    const options = cell.neighbours.filter((n) => !cell.links.includes(n));
    if (!options.length) continue;
    const pick = options[Math.floor(rng() * options.length)];
    cell.links.push(pick);
    cells[pick].links.push(cell.id);
  }
}

/** Breadth-first shortest path. Returns [] when unreachable. */
export function solve(cells: Cell[], start: number, end: number): number[] {
  const prev = new Int32Array(cells.length).fill(-1);
  const seen = new Uint8Array(cells.length);
  const queue = [start];
  seen[start] = 1;

  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    if (at === end) break;
    for (const n of cells[at].links) {
      if (seen[n]) continue;
      seen[n] = 1;
      prev[n] = at;
      queue.push(n);
    }
  }

  if (!seen[end]) return [];
  const path: number[] = [];
  for (let at = end; at !== -1; at = prev[at]) path.push(at);
  return path.reverse();
}

/**
 * Measure what the maze is actually like to solve.
 *
 * Declaring a difficulty is easy; proving it is not. These numbers let the
 * tests assert that "hard" really does branch more than "easy".
 */
export function analyse(cells: Cell[], solution: number[]): MazeStats {
  const onPath = new Set(solution);
  const deadEnds = cells.filter((c) => c.links.length === 1).length;
  const decisions = solution.filter((id) => cells[id].links.length > 2).length;

  // Longest wrong turn: from each junction on the path, how far can you go
  // down a branch that leaves the solution?
  let worst = 0;
  for (const id of solution) {
    for (const n of cells[id].links) {
      if (onPath.has(n)) continue;
      // BFS into the branch
      const seen = new Set<number>([id, n]);
      let depth = 0;
      let frontier = [n];
      while (frontier.length && depth < 400) {
        const next: number[] = [];
        for (const f of frontier) {
          for (const m of cells[f].links) {
            if (seen.has(m) || onPath.has(m)) continue;
            seen.add(m);
            next.push(m);
          }
        }
        if (!next.length) break;
        frontier = next;
        depth++;
      }
      worst = Math.max(worst, depth + 1);
    }
  }

  return {
    cellCount: cells.length,
    pathLength: solution.length,
    deadEnds,
    decisions,
    worstDetour: worst,
  };
}

/**
 * Walls for a circular (theta) maze, built in polar space.
 *
 * Each cell contributes at most two walls: the arc along its inner edge, and
 * the radial spoke on one side. Both are emitted only when the neighbour on
 * that side is not linked, so the graph stays the authority — same rule as the
 * straight-edged shapes, just expressed in polar coordinates.
 */
function buildCircularWalls(cells: Cell[], start: number, end: number) {
  const walls: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const pt = (radius: number, angle: number) => ({
    x: 0.5 + Math.cos(angle) * radius,
    y: 0.5 + Math.sin(angle) * radius,
  });
  const arcSegments = (radius: number, from: number, to: number) => {
    const steps = Math.max(2, Math.ceil(Math.abs(to - from) * radius * 60));
    for (let s = 0; s < steps; s++) {
      const p1 = pt(radius, from + ((to - from) * s) / steps);
      const p2 = pt(radius, from + ((to - from) * (s + 1)) / steps);
      walls.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
  };

  const maxRing = Math.max(...cells.map((c) => c.ring));

  for (const cell of cells) {
    const pol = cell.polar;
    if (!pol) continue;

    // Radial spoke between this cell and the next one clockwise in the ring.
    if (pol.count > 1) {
      const next = cells.find(
        (c) => c.ring === cell.ring && c.polar?.index === (pol.index + 1) % pol.count,
      );
      if (next && !cell.links.includes(next.id)) {
        const a = pt(pol.inner, pol.a1);
        const b = pt(pol.outer, pol.a1);
        walls.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }

    // Arc along the inner edge, i.e. the wall toward the centre.
    if (cell.ring > 0) {
      const inward = cell.neighbours.find((n) => cells[n].ring === cell.ring - 1);
      if (inward !== undefined && !cell.links.includes(inward)) {
        arcSegments(pol.inner, pol.a0, pol.a1);
      }
    }

    // Outer boundary of the whole maze, left open at the entrance.
    if (cell.ring === maxRing && cell.id !== start && cell.id !== end) {
      arcSegments(pol.outer, pol.a0, pol.a1);
    }
  }
  return walls;
}

/**
 * Walls, derived from the graph rather than from geometry.
 *
 * The first version matched shared polygon edges by exact string key. That
 * worked for rectangular cells, whose corners are computed identically from
 * both sides, but triangular and hexagonal corners come out of trigonometry and
 * differ in the final floating-point bits. Nothing matched, no walls were ever
 * removed, and those two shapes rendered as solid grids with a solution line
 * cutting straight through them.
 *
 * The graph is always right, so it is the authority: for every neighbour pair
 * that is NOT linked, find the polygon edge they share (nearest corners within
 * a tolerance) and draw it. Boundary edges — those belonging to no neighbour —
 * are kept to enclose the maze, except at the entrance and exit.
 */
function buildWalls(cells: Cell[], start: number, end: number) {
  const walls: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const TOL = 1e-6;
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < TOL && Math.abs(a.y - b.y) < TOL;

  /** The edge two cells have in common, if their outlines touch along one. */
  const sharedEdge = (a: Cell, b: Cell) => {
    for (let i = 0; i < a.poly.length; i++) {
      const a1 = a.poly[i], a2 = a.poly[(i + 1) % a.poly.length];
      for (let j = 0; j < b.poly.length; j++) {
        const b1 = b.poly[j], b2 = b.poly[(j + 1) % b.poly.length];
        if ((near(a1, b1) && near(a2, b2)) || (near(a1, b2) && near(a2, b1))) {
          return { x1: a1.x, y1: a1.y, x2: a2.x, y2: a2.y };
        }
      }
    }
    return null;
  };

  const drawnBoundary = new Set<string>();

  for (const cell of cells) {
    for (let i = 0; i < cell.poly.length; i++) {
      const p1 = cell.poly[i];
      const p2 = cell.poly[(i + 1) % cell.poly.length];

      // Which neighbour, if any, sits on the other side of THIS edge?
      const isSameEdge = (e: { x1: number; y1: number; x2: number; y2: number }) =>
        (near({ x: e.x1, y: e.y1 }, p1) && near({ x: e.x2, y: e.y2 }, p2))
        || (near({ x: e.x1, y: e.y1 }, p2) && near({ x: e.x2, y: e.y2 }, p1));

      let owner: number | null = null;
      for (const n of cell.neighbours) {
        const e = sharedEdge(cell, cells[n]);
        if (e && isSameEdge(e)) {
          owner = n;
          break;
        }
      }

      if (owner === null) {
        // Outer boundary. Draw once, and leave a gap at the entrance/exit.
        if (cell.id === start || cell.id === end) continue;
        const k = [
          `${Math.min(p1.x, p2.x).toFixed(5)},${Math.min(p1.y, p2.y).toFixed(5)}`,
          `${Math.max(p1.x, p2.x).toFixed(5)},${Math.max(p1.y, p2.y).toFixed(5)}`,
        ].join('|');
        if (drawnBoundary.has(k)) continue;
        drawnBoundary.add(k);
        walls.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        continue;
      }

      // Internal edge: wall it only if the two cells are not joined, and only
      // from the lower id so it is not drawn twice.
      if (cell.id < owner && !cell.links.includes(owner)) {
        walls.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      }
    }
  }
  return walls;
}

/**
 * The two cells with the longest path between them (the graph's diameter),
 * found by double BFS.
 *
 * Turning the carver further toward random did NOT make mazes harder —
 * measured, it made them easier, because pure randomness backtracks more and
 * leaves long unbranched corridors. Expert therefore earns its difficulty
 * structurally: the solution is the longest route the maze can offer.
 */
function farthestPair(cells: Cell[]): { start: number; end: number } {
  const bfs = (from: number) => {
    const dist = new Int32Array(cells.length).fill(-1);
    dist[from] = 0;
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      for (const n of cells[q[h]].links) {
        if (dist[n] === -1) { dist[n] = dist[q[h]] + 1; q.push(n); }
      }
    }
    let best = from;
    for (let i = 0; i < dist.length; i++) if (dist[i] > dist[best]) best = i;
    return best;
  };
  const a = bfs(0);
  const b = bfs(a);
  return { start: a, end: b };
}

/** Pick entrance and exit far apart, on the requested side. */
function pickEnds(cells: Cell[], shape: MazeShape, startsAt: MazeOptions['startsAt']) {
  if (shape === 'circular') {
    const maxRing = Math.max(...cells.map((c) => c.ring));
    const outer = cells.filter((c) => c.ring === maxRing);
    const centre = cells.filter((c) => c.ring === 0);
    // Circular mazes read best as "get to the middle".
    const entry = outer.reduce((best, c) =>
      (startsAt === 'bottom' ? c.cy > best.cy : c.cy < best.cy) ? c : best, outer[0]);
    return { start: entry.id, end: centre[0].id };
  }

  const byY = [...cells].sort((a, b) => a.cy - b.cy);
  const byX = [...cells].sort((a, b) => a.cx - b.cx);
  switch (startsAt) {
    case 'bottom': return { start: byY[byY.length - 1].id, end: byY[0].id };
    case 'left': return { start: byX[0].id, end: byX[byX.length - 1].id };
    case 'right': return { start: byX[byX.length - 1].id, end: byX[0].id };
    case 'centre': {
      const mid = cells.reduce((best, c) =>
        Math.hypot(c.cx - 0.5, c.cy - 0.5) < Math.hypot(best.cx - 0.5, best.cy - 0.5) ? c : best,
        cells[0]);
      return { start: mid.id, end: byY[byY.length - 1].id };
    }
    default: return { start: byY[0].id, end: byY[byY.length - 1].id };
  }
}

/** Build one maze. Deterministic for a given seed. */
export function generateMaze(opts: MazeOptions): Maze {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeRng(seed);
  const tune = DIFFICULTY[opts.difficulty];

  const w = Math.max(2, Math.min(200, Math.round(opts.width)));
  const h = Math.max(2, Math.min(200, Math.round(opts.height)));

  let cells: Cell[];
  switch (opts.shape) {
    case 'circular': cells = buildCircular(Math.max(3, Math.min(60, w)), 1); break;
    case 'triangular': cells = buildTriangular(Math.max(3, Math.min(60, h))); break;
    case 'hexagonal': cells = buildHexagonal(w, h); break;
    default: cells = buildRectangular(w, h);
  }

  carve(cells, rng, tune.straightness);

  const braidAmount = opts.braid > 0 ? opts.braid : tune.braid;
  braid(cells, rng, braidAmount);

  // Expert stretches the solution to the maze's true diameter. Every other
  // level honours the requested entrance side, which matters for book layout.
  const { start, end } = opts.difficulty === 'expert'
    ? farthestPair(cells)
    : pickEnds(cells, opts.shape, opts.startsAt);
  const solution = solve(cells, start, end);
  const walls = opts.shape === 'circular'
    ? buildCircularWalls(cells, start, end)
    : buildWalls(cells, start, end);

  return {
    shape: opts.shape,
    cells,
    start,
    end,
    solution,
    walls,
    seed,
    difficulty: opts.difficulty,
    stats: analyse(cells, solution),
  };
}

/** Build a book's worth, each with its own seed so none repeat. */
export function generateMazes(opts: MazeOptions, count: number, baseSeed?: number): Maze[] {
  const root = baseSeed ?? Math.floor(Math.random() * 2 ** 31);
  return Array.from({ length: count }, (_, i) =>
    generateMaze({ ...opts, seed: root + i * 7919 }));
}
