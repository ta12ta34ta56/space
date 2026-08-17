/**
 * TopBar — book name, trim, page count (spec 06 §4). 48px.
 *
 * Preflight and Export belong to Unit 11, and a control that is not
 * implemented is not rendered (honesty rule 3) — so they are absent here,
 * not greyed out.
 *
 * The book name edits inline: local draft state while typing (genuinely
 * ephemeral UI), one `book/setTitle` command on commit — one undo entry.
 */

import { useState } from 'react';
import { TRIM_SIZE_IN } from '../../print';
import { store } from '../../state/store';
import { Field } from '../kit/Field';

export function TopBar() {
  const doc = store((s) => s.doc);
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft !== null && draft !== doc.meta.title) {
      store.getState().dispatch({ t: 'book/setTitle', title: draft }, Date.now());
    }
    setDraft(null);
  };

  const trim = TRIM_SIZE_IN[doc.book.trimId];
  const pageCount = doc.pages.length;

  return (
    <header className="shell-top">
      <span className="shell-brand">Novelka</span>
      <Field
        label="Book name"
        hideLabel
        className="shell-title"
        value={draft ?? doc.meta.title}
        placeholder="Untitled book"
        onValueChange={setDraft}
        onCommit={commit}
        onCancel={() => setDraft(null)}
      />
      <span className="shell-meta">
        <span className="shell-mono">
          {trim.widthIn} × {trim.heightIn} in
        </span>
        <span className="shell-meta-sep" aria-hidden="true">
          ·
        </span>
        <span className="shell-mono">
          {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </span>
      </span>
    </header>
  );
}
