import { lazy, Suspense, type ReactElement } from 'react';
import { Icon, type IconName } from '../Icon';
import { useGeneratorStore, type GeneratorId } from '../../stores/generator-store';
import { ClosePanelButton } from '../ClosePanelButton';

/**
 * Generator panels are heavy (puzzle engines, renderers, workers). Each is its
 * own chunk, downloaded only when the user actually opens that generator —
 * the hub card grid stays in the main bundle.
 */
const SudokuPanel = lazy(() =>
  import('../../modules/sudoku-maker/SudokuPanel').then((m) => ({ default: m.SudokuPanel })),
);
const WordSearchPanel = lazy(() =>
  import('../../modules/word-search/WordSearchPanel').then((m) => ({ default: m.WordSearchPanel })),
);
const CrosswordPanel = lazy(() =>
  import('../../modules/crossword/CrosswordPanel').then((m) => ({ default: m.CrosswordPanel })),
);
const MazePanel = lazy(() =>
  import('../../modules/maze/MazePanel').then((m) => ({ default: m.MazePanel })),
);
const HandwritingPanel = lazy(() =>
  import('../../modules/handwriting/HandwritingPanel').then((m) => ({ default: m.HandwritingPanel })),
);

const GENERATORS: {
  id: GeneratorId;
  label: string;
  description: string;
  icon: IconName;
}[] = [
  {
    id: 'sudoku',
    label: 'Sudoku',
    description: 'Build Sudoku puzzle books with answer keys.',
    icon: 'puzzle',
  },
  {
    id: 'wordsearch',
    label: 'Word Search',
    description: 'Generate themed word-search books and solutions.',
    icon: 'search',
  },
  {
    id: 'crossword',
    label: 'Crossword',
    description: 'Create crossword books from clue banks or custom clues.',
    icon: 'crossword',
  },
  {
    id: 'maze',
    label: 'Maze',
    description: 'Generate maze activity books with solution pages.',
    icon: 'grid',
  },
  {
    id: 'handwriting',
    label: 'Handwriting / Tracing',
    description: 'Build letter, number and word tracing worksheets.',
    icon: 'type',
  },
];

const GENERATOR_PANEL: Record<GeneratorId, () => ReactElement> = {
  sudoku: () => <SudokuPanel />,
  wordsearch: () => <WordSearchPanel />,
  crossword: () => <CrosswordPanel />,
  maze: () => <MazePanel />,
  handwriting: () => <HandwritingPanel />,
};

export function GeneratorHubPanel() {
  const activeGenerator = useGeneratorStore((s) => s.activeGenerator);
  const openGenerator = useGeneratorStore((s) => s.openGenerator);

  if (activeGenerator) {
    const Panel = GENERATOR_PANEL[activeGenerator];
    const meta = GENERATORS.find((g) => g.id === activeGenerator);

    return (
      <div className="panel">
        <div className="panel-head">
          <button
            className="btn sm ghost"
            onClick={() => openGenerator(null)}
            title="Back to generator tools"
            aria-label="Back to generator tools"
          >
            <Icon name="chevronRight" size={13} /> Back to Generators
          </button>
          <span className="badge">{meta?.label ?? 'Generator'}</span>
          <ClosePanelButton />
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <Suspense fallback={<div className="empty">Loading generator…</div>}>
            <Panel />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Generators</span>
        <span className="badge">activity tools</span>
        <ClosePanelButton />
      </div>
      <div className="panel-body">
        <div className="section">
          <div className="section-title">Choose a generator</div>
          <p className="hint" style={{ marginTop: -4 }}>
            Build puzzle and activity-book pages, then edit the generated objects on the canvas.
          </p>
        </div>

        <div className="grid-3">
          {GENERATORS.map((g) => (
            <button
              key={g.id}
              className="template-card"
              onClick={() => openGenerator(g.id)}
              title={g.description}
            >
              <div className="prev" style={{ display: 'grid', placeItems: 'center' }}>
                <Icon name={g.icon} size={30} />
              </div>
              <div className="cap">{g.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
