/**
 * RightDock — the 280px panel column (spec 07 §1, ui-context.md §7).
 *
 * Tabs, not stacked accordions: Pages, Layers, Inspector. Tabs are navigation,
 * not dead controls (honesty rule 3) — each one leads to a panel that exists.
 * Inspector's panel says so plainly rather than pretending to be empty.
 *
 * The legacy dock was an edge rail that slid open and shut over the workspace.
 * That shell is deliberately NOT ported: Unit 06 reserved a fixed 280px column
 * and the dock lives in it. What is ported, exactly, is what is INSIDE the
 * panels (D17) — the Pages tab in Unit 07 and the Layers tab in Unit 08.
 */

import { nanoid } from 'nanoid';
import { store } from '../../state/store';
import { useUiStore, type PanelId } from '../../state/ui-store';
import { LayersTab } from './LayersTab';
import { PagesTab } from './PagesTab';

/** The tabs this dock shows today. Generator and Template arrive with their units. */
const TABS: readonly { readonly id: PanelId; readonly label: string }[] = [
  { id: 'pages', label: 'Pages' },
  { id: 'layers', label: 'Layers' },
  { id: 'inspector', label: 'Inspector' },
];

export function RightDock() {
  const activePanel = useUiStore((s) => s.activePanel);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const pageCount = store((s) => s.doc.pages.length);

  // Pages is the panel the editor opens on; the dock is never blank.
  const active: PanelId = activePanel ?? 'pages';

  return (
    <aside className="shell-dock" aria-label="Pages, layers and inspector">
      <div className="dock-tabs" role="tablist" aria-label="Panels">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`dock-tab-${tab.id}`}
            className={`dock-tab${active === tab.id ? ' active' : ''}`}
            aria-selected={active === tab.id}
            aria-controls={`dock-panel-${tab.id}`}
            onClick={() => setActivePanel(tab.id)}
          >
            {tab.label}
            {tab.id === 'pages' && <span className="dock-count">{pageCount}</span>}
          </button>
        ))}
      </div>

      <div
        className="dock-body"
        role="tabpanel"
        id={`dock-panel-${active}`}
        aria-labelledby={`dock-tab-${active}`}
      >
        {active === 'pages' && <PagesTab newId={() => nanoid()} now={() => Date.now()} />}
        {active === 'layers' && <LayersTab newId={() => nanoid()} now={() => Date.now()} />}
        {active === 'inspector' && (
          <div className="empty">
            The inspector arrives with element editing.
            <br />
            Until then, use the Pages and Layers tabs.
          </div>
        )}
      </div>
    </aside>
  );
}
