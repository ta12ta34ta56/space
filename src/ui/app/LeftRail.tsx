/**
 * LeftRail — the 56px view-toggle rail (spec 06 §5).
 *
 * Structure and behaviour ported from the legacy FoundationRail (D17): a
 * column of toggle buttons, each with `aria-pressed`, an `aria-label`, and a
 * text label under the icon — words teach, glyphs do not (ui-context §6).
 * Colours are retokenised to D23; the layout is not redesigned.
 *
 * Rulers, grid, snap and smart guides have no behaviour until Unit 09, so
 * their toggles are not rendered (honesty rule 3). The rail ships with the
 * toggles that work: the guide visibility toggles. The legacy "KDP" and
 * "Margins" toggles both marked interior boxes; here each guide kind toggles
 * individually (spec 06 §2), so safe area, gutter and trim get their own
 * buttons. The bleed GUIDE toggle only renders while bleed is on — while
 * bleed is off there is no bleed guide, and a toggle that controls nothing
 * visible is a dead control. The bleed switch itself (D9) is in the bottom
 * bar. Spine and barcode are cover guides; their toggles arrive with the
 * cover surface in Unit 10.
 */

import { roundIn } from '../../model';
import { BLEED_IN } from '../../print';
import { store } from '../../state/store';
import { useUiStore } from '../../state/ui-store';
import { Icon, type IconName } from '../kit/Icon';
import { Tooltip } from '../kit/Tooltip';

type RailToggle = {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly on: boolean;
  readonly toggle: () => void;
  readonly ariaLabel: string;
  readonly tip: string;
};

export function LeftRail() {
  const visibleGuides = useUiStore((s) => s.visibleGuides);
  const bleed = store((s) => s.doc.book.bleed);
  const toggleGuide = useUiStore((s) => s.toggleGuide);

  const toggles: readonly RailToggle[] = [
    {
      id: 'safe',
      label: 'Safe',
      icon: 'safe',
      on: visibleGuides.safe,
      toggle: () => toggleGuide('safe'),
      ariaLabel: 'Show or hide the safe area guide',
      tip: 'Safe area. Keep every element inside this box. Content outside it can be cut off in printing or lost in the binding.',
    },
    {
      id: 'gutter',
      label: 'Gutter',
      icon: 'gutter',
      on: visibleGuides.gutter,
      toggle: () => toggleGuide('gutter'),
      ariaLabel: 'Show or hide the gutter guide',
      tip: 'Gutter. The inside margin swallowed by the binding. It sits on the left of a right hand page and on the right of a left hand page.',
    },
    {
      id: 'trim',
      label: 'Trim',
      icon: 'trim',
      on: visibleGuides.trim,
      toggle: () => toggleGuide('trim'),
      ariaLabel: 'Show or hide the trim guide',
      tip: 'Trim. The line where the printed sheet is cut to its final page size.',
    },
    // The bleed guide is only toggleable while bleed exists (D9): while the
    // book has no bleed there is no bleed guide, and a toggle over nothing
    // would be a dead control.
    ...(bleed
      ? [
          {
            id: 'bleed',
            label: 'Bleed',
            icon: 'bleed',
            on: visibleGuides.bleed,
            toggle: () => toggleGuide('bleed'),
            ariaLabel: 'Show or hide the bleed guide',
            tip: `Bleed. Art meant to run off the page must extend ${roundIn(BLEED_IN)} in past the trim line, or the cut can leave a white sliver at the edge.`,
          } satisfies RailToggle,
        ]
      : []),
  ];

  return (
    <nav className="shell-rail" aria-label="View options">
      {toggles.map((t) => (
        <Tooltip key={t.id} text={t.tip} side="right">
          <button
            type="button"
            className={`rail-btn${t.on ? ' is-active' : ''}`}
            onClick={t.toggle}
            aria-pressed={t.on}
            aria-label={t.ariaLabel}
          >
            <Icon name={t.icon} size={18} />
            <span className="rail-btn-label">{t.label}</span>
          </button>
        </Tooltip>
      ))}
    </nav>
  );
}
