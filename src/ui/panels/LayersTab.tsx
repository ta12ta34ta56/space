/**
 * LayersTab — the Layers panel, ported from the previous build (Unit 08, D17)
 * with D18 fixed while porting.
 *
 * PORTED, not redesigned: same markup, same class names, same interactions as
 * `legacy/novelka/src/components/editor/RightDock.tsx` L578-L802. Colours are
 * retokenised (D23). The data source is what changed, and one behaviour is
 * now correct that was not before: **a divider says "Divider"**.
 *
 * What is deleted rather than ported, and why:
 *
 *  - `useLayerTree`'s five canvas listeners AND its 900 ms polling timer. The
 *    poll existed because events were missed. The Document is the truth and
 *    Unit 02's structural sharing says exactly when it changed, so a poll has
 *    nothing to add.
 *  - The three appearance-sniffing predicates and the label function's
 *    guessing branches. `kind` is stored at insertion (D18, invariant 8); the
 *    row reads one property.
 *  - The puzzle-tag lookups, `memberIds`, and the clustering that built a
 *    synthetic "unit" row out of loose Fabric objects. A puzzle is one element
 *    and therefore one row (D3). There is nothing to cluster.
 *
 * Selection lives in `ui-store`, never in the Document: clicking a layer must
 * not become an undoable, autosaved change (architecture.md §2).
 */

import { useCallback, useState } from 'react';
import type { Command } from '../../model';
import { store } from '../../state/store';
import { useUiStore } from '../../state/ui-store';
import { Icon } from '../kit/Icon';
import { kindMetaFor, layerRowsFor, zForMove, type LayerRow } from './layer-rows';
import { useGrabReorder } from './useGrabReorder';

export type LayersTabProps = {
  /** Injected id source, kept for parity with the other panels. */
  readonly newId: () => string;
  /** Injected clock, so the panel never reads the wall clock itself. */
  readonly now: () => number;
};

export function LayersTab({ now }: LayersTabProps) {
  const doc = store((s) => s.doc);
  const currentPageIndex = useUiStore((s) => s.currentPageIndex);
  const selection = useUiStore((s) => s.selection);
  const setSelection = useUiStore((s) => s.setSelection);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const pageIndex = doc.pages.length === 0 ? -1 : Math.min(currentPageIndex, doc.pages.length - 1);
  const page = pageIndex < 0 ? null : (doc.pages[pageIndex] ?? null);
  const rows = page === null ? [] : layerRowsFor(page);

  const dispatch = useCallback(
    (command: Command) => {
      store.getState().dispatch(command, now());
    },
    [now],
  );

  const reorderRows = useCallback(
    (from: number, to: number) => {
      if (page === null) return;
      const current = layerRowsFor(page);
      const moving = current[from];
      if (moving === undefined) return;
      // A locked layer is not moved: locking a layer is what stops it changing.
      if (moving.locked) return;
      const z = zForMove(current, from, to);
      if (z === null) return;
      // One command on release, one undo entry (spec 02 §3).
      dispatch({ t: 'element/reorder', pageId: page.id, elementId: moving.id, z });
    },
    [page, dispatch],
  );

  const reorder = useGrabReorder(rows, reorderRows);

  if (page === null || rows.length === 0) {
    return (
      <div className="docklayers" ref={reorder.listRef}>
        <div className="empty" style={{ margin: 12 }}>
          This page is empty.
          <br />
          Add text, elements or a puzzle from the left rail.
        </div>
      </div>
    );
  }

  const pageId = page.id;

  const renderRow = (row: LayerRow, isChild = false) => {
    const meta = kindMetaFor(row.kind);
    const hasChildren = row.children.length > 0 && !isChild;
    const open = expanded.has(row.id);
    const classes = ['docklayer'];
    if (selection.includes(row.id)) classes.push('active');
    if (isChild) classes.push('child');
    if (!isChild && reorder.grabId === row.id) classes.push('move-mode');

    const index = rows.findIndex((candidate) => candidate.id === row.id);

    return (
      <div key={row.id}>
        <div
          {...(isChild ? {} : { 'data-reorder-id': row.id })}
          className={classes.join(' ')}
          onClick={() => {
            if (isChild) return;
            // Selection is view state, never a document edit (architecture §2).
            if (row.locked) return;
            setSelection([row.id]);
          }}
          onDoubleClick={() => {
            if (isChild) return;
            reorder.grab(row.id);
          }}
          {...(isChild ? {} : { title: 'Double-click to drag into a new order' })}
          {...(isChild ? {} : { role: 'button', tabIndex: 0 })}
          onKeyDown={(e) => {
            if (isChild) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!row.locked) setSelection([row.id]);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (index > 0) reorderRows(index, index - 1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (index >= 0 && index < rows.length - 1) reorderRows(index, index + 1);
            }
          }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="docklayer-chevron"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(row.id)) next.delete(row.id);
                  else next.add(row.id);
                  return next;
                });
              }}
              title={open ? 'Collapse' : 'Expand'}
              aria-label={open ? 'Collapse group' : 'Expand group'}
            >
              <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
            </button>
          ) : (
            <span className="docklayer-chevron blank" />
          )}

          <span className={`docklayer-type ${meta.className}`} title={meta.label}>
            <Icon name={meta.icon} size={12} />
          </span>
          <span className="docklayer-name">{row.name}</span>
          {row.children.length > 0 && <span className="docklayer-count">{row.children.length}</span>}

          {!isChild && (
            <span className="docklayer-actions">
              <button
                type="button"
                className={`mini-btn ${row.hidden ? 'on' : ''}`}
                title={row.hidden ? 'Show' : 'Hide'}
                aria-label={row.hidden ? 'Show layer' : 'Hide layer'}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({
                    t: 'element/update',
                    pageId,
                    elementId: row.id,
                    patch: { hidden: !row.hidden },
                  });
                }}
              >
                <Icon name={row.hidden ? 'eyeoff' : 'eye'} size={12} />
              </button>
              <button
                type="button"
                className={`mini-btn ${row.locked ? 'on' : ''}`}
                title={row.locked ? 'Unlock' : 'Lock'}
                aria-label={row.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({
                    t: 'element/update',
                    pageId,
                    elementId: row.id,
                    patch: { locked: !row.locked },
                  });
                }}
              >
                <Icon name={row.locked ? 'lock' : 'unlock'} size={12} />
              </button>
              <button
                type="button"
                className="mini-btn danger"
                title="Delete"
                aria-label="Delete layer"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ t: 'element/delete', pageId, elementIds: [row.id] });
                }}
              >
                <Icon name="trash2" size={12} />
              </button>
            </span>
          )}
        </div>

        {hasChildren && open && (
          <div className="docklayer-children">{row.children.map((child) => renderRow(child, true))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="docklayers" ref={reorder.listRef}>
      <div className="docklayers-order">
        <span className="docklayers-hint">Double-click a layer to drag it into a new order</span>
      </div>
      {rows.map((row) => renderRow(row))}
      {reorder.grabId !== null && reorder.indicatorTop !== null && (
        <div className="dockpage-dropline" style={{ top: reorder.indicatorTop }} />
      )}
    </div>
  );
}
