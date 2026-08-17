import { useMemo, useState } from 'react';
import { useFlagStore } from '../../stores/flag-store';
import {
  DEFAULT_FLAGS,
  FEATURES,
  TIERS,
  type FeatureId,
  type Tier,
} from '../../services/feature-flags';
import { Icon } from '../Icon';
import {
  KIND_LABEL,
  effectiveRules,
  type ContentItem,
  type ContentKind,
} from '../../services/content-registry';

/**
 * Owner's control panel.
 *
 * The product rule is that admin control is absolute: everything gateable is
 * listed here and can be turned off, put behind an ad, or made premium without
 * a code change. The table is generated from `FEATURES`, so a capability added
 * to that list shows up here automatically and cannot be forgotten.
 *
 * The tier switcher is a **preview** tool: it changes what the current session
 * sees so the owner can check a free user's experience without a second
 * account. Real entitlement will come from the server in a later phase.
 */

/**
 * The three unlock routes are independent switches, not one exclusive choice:
 * a feature can be reachable by ad *and* by subscription at the same time.
 */
const ROUTES: { key: 'free' | 'ad' | 'paid'; label: string; hint: string }[] = [
  { key: 'free', label: 'Free', hint: 'Anyone can use it, no ad and no subscription' },
  { key: 'ad', label: 'Ad', hint: 'A free user can unlock it by watching an ad' },
  { key: 'paid', label: 'Paid', hint: 'Subscribers get it outright' },
];

/** Plain-English summary of what a row currently does. */
function describe(f: { enabled: boolean; routes: { free: boolean; ad: boolean; paid: boolean }; minTier: string; dailyLimit?: number }) {
  if (!f.enabled) return 'Off for everyone';
  const { free, ad, paid } = f.routes;
  if (!free && !ad && !paid) return 'Off — no way in';
  const cap = f.dailyLimit !== undefined ? ` · ${f.dailyLimit}/day free` : '';
  if (free) return `Everyone${cap}`;
  if (ad && paid) return `Ad or ${f.minTier}${cap}`;
  if (ad) return `Ad only${cap}`;
  return `${f.minTier} and above`;
}

const GROUPS: { title: string; match: (id: string) => boolean }[] = [
  { title: 'Puzzle modules', match: (id) => id.startsWith('module.') },
  { title: 'Export', match: (id) => id.startsWith('export.') },
  { title: 'Authoring', match: (id) => id.startsWith('doc.') || id.startsWith('pages.') },
  { title: 'Assets & KDP', match: (id) => id.startsWith('assets.') || id.startsWith('kdp.') },
];

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const {
    flags, entitlement, setFlag, setTier, resetAll,
    content, contentOverrides, setContentOverride, resetContent,
  } = useFlagStore();
  const [filter, setFilter] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [tab, setTab] = useState<'features' | 'content'>('features');
  const [openKind, setOpenKind] = useState<ContentKind | null>('page-template');

  const ids = useMemo(
    () => (Object.keys(FEATURES) as FeatureId[]).filter((id) =>
      !filter ||
      id.toLowerCase().includes(filter.toLowerCase()) ||
      FEATURES[id].toLowerCase().includes(filter.toLowerCase())),
    [filter],
  );

  const grouped = GROUPS.map((g) => ({ ...g, items: ids.filter((id) => g.match(id)) }))
    .filter((g) => g.items.length);

  // "Changed" must mean *changed from the shipping default*, not merely
  // "gated" — several features ship gated on purpose, and counting those made
  // a fresh install claim edits the owner never made.
  const changed = (Object.keys(FEATURES) as FeatureId[]).filter((id) => {
    const f = flags[id];
    const d = DEFAULT_FLAGS[id];
    if (!f || !d || !f.routes || !d.routes) return false;
    return (
      f.enabled !== d.enabled ||
      f.routes.free !== d.routes.free ||
      f.routes.ad !== d.routes.ad ||
      f.routes.paid !== d.routes.paid ||
      f.minTier !== d.minTier ||
      f.dailyLimit !== d.dailyLimit
    );
  }).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>
            Admin <span className="badge">owner</span>
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="Close admin panel">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="modal-body admin-body">
          {/* ---------------------------------------------- preview as */}
          <section className="admin-sec">
            <h3>Preview as</h3>
            <p className="hint">
              Changes what <strong>this browser</strong> sees, so you can check each
              plan without a second account. It does not change anyone else.
            </p>
            <div className="opt-grid" style={{ marginTop: 8 }}>
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  className={`opt ${entitlement.tier === t.id ? 'active' : ''}`}
                  onClick={() => void setTier(t.id as Tier)}
                >
                  <div className="t">{t.name}</div>
                  <div className="s">{t.price}</div>
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              {TIERS.find((t) => t.id === entitlement.tier)?.blurb}
              {entitlement.adUnlocked.length > 0 && (
                <> · {entitlement.adUnlocked.length} ad unlock(s) active this session</>
              )}
            </p>
          </section>

          <div className="seg" style={{ margin: '4px 0 14px' }}>
            <button className={tab === 'features' ? 'active' : ''} onClick={() => setTab('features')}>
              Features
            </button>
            <button className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}>
              Content <span className="badge">{content.length}</span>
            </button>
          </div>

          {/* ---------------------------------------------- features */}
          <section className="admin-sec" style={{ display: tab === 'features' ? undefined : 'none' }}>
            <div className="row between" style={{ alignItems: 'baseline' }}>
              <h3>
                Features{' '}
                <span className="badge">{Object.keys(FEATURES).length}</span>
                {changed > 0 && <span className="badge warn">{changed} changed</span>}
              </h3>
              <input
                className="admin-filter"
                placeholder="Filter…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filter features"
              />
            </div>

            {grouped.map((g) => (
              <div key={g.title} className="admin-group">
                <h4>{g.title}</h4>
                {g.items.map((id) => {
                  // Guard the render too: a malformed row must grey out, never
                  // take the whole admin panel down with it.
                  const f = flags[id];
                  if (!f || !f.routes) return null;
                  return (
                    <div key={id} className={`admin-row ${f.enabled ? '' : 'is-off'}`}>
                      <div className="admin-name">
                        <strong>{FEATURES[id]}</strong>
                        <code>{id}</code>
                        <span className="admin-summary">{describe(f)}</span>
                      </div>

                      <div className="admin-controls">
                        <div className="route-toggles">
                          {ROUTES.map((rt) => (
                            <button
                              key={rt.key}
                              className={`route-chip ${f.enabled && f.routes[rt.key] ? 'on' : ''}`}
                              title={rt.hint}
                              aria-pressed={f.enabled && f.routes[rt.key]}
                              onClick={() =>
                                void setFlag(id, {
                                  enabled: true,
                                  routes: { ...f.routes, [rt.key]: !f.routes[rt.key] },
                                })
                              }
                            >
                              {rt.label}
                            </button>
                          ))}
                          <button
                            className={`route-chip off ${f.enabled ? '' : 'on'}`}
                            title="Off for everyone, including you" aria-label="Off for everyone, including you"
                            aria-pressed={!f.enabled}
                            onClick={() => void setFlag(id, { enabled: !f.enabled })}
                          >
                            Off
                          </button>
                        </div>

                        <select
                          className="admin-tier"
                          value={f.minTier}
                          disabled={!f.enabled || !f.routes.paid}
                          onChange={(e) => void setFlag(id, { minTier: e.target.value as Tier })}
                          aria-label={`Minimum tier for ${FEATURES[id]}`}
                        >
                          {TIERS.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>

                        <input
                          className="admin-limit"
                          type="number"
                          min={0}
                          placeholder="∞"
                          value={f.dailyLimit ?? ''}
                          disabled={!f.enabled}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            void setFlag(id, {
                              dailyLimit: v === '' ? undefined : Math.max(0, Number(v) || 0),
                            });
                          }}
                          title="Daily limit for free users — blank means unlimited"
                          aria-label={`Daily limit for ${FEATURES[id]}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {grouped.length === 0 && (
              <div className="empty boxed">Nothing matches “{filter}”.</div>
            )}
          </section>

          {tab === 'content' && (
            <section className="admin-sec">
              <div className="row between" style={{ alignItems: 'baseline' }}>
                <h3>
                  Content <span className="badge">{content.length}</span>
                  {Object.keys(contentOverrides).length > 0 && (
                    <span className="badge warn">
                      {Object.keys(contentOverrides).length} changed
                    </span>
                  )}
                </h3>
                <input
                  className="admin-filter"
                  placeholder="Filter…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  aria-label="Filter content"
                />
              </div>
              <p className="hint">
                Every template, ruled paper style, puzzle page design and asset pack.
                Set each one to Free, Ad, Paid — or any combination.
              </p>

              {(Object.keys(KIND_LABEL) as ContentKind[]).map((kind) => {
                const items = content.filter(
                  (c) =>
                    c.kind === kind &&
                    (!filter ||
                      c.name.toLowerCase().includes(filter.toLowerCase()) ||
                      c.id.toLowerCase().includes(filter.toLowerCase())),
                );
                if (!items.length) return null;
                const open = openKind === kind || !!filter;
                return (
                  <div key={kind} className="admin-group">
                    <button
                      className="kind-head"
                      onClick={() => setOpenKind(open && !filter ? null : kind)}
                      aria-expanded={open}
                    >
                      <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} />
                      {KIND_LABEL[kind]} <span className="badge">{items.length}</span>
                      <span className="kind-bulk">
                        {(['free', 'ad', 'paid'] as const).map((route) => (
                          <em
                            key={route}
                            role="button"
                            tabIndex={0}
                            title={`Set all ${items.length} to ${route}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              for (const it of items) {
                                void setContentOverride(it.key, {
                                  routes: {
                                    free: route === 'free',
                                    ad: route === 'ad',
                                    paid: route === 'paid',
                                  },
                                  minTier: route === 'free' ? 'free' : 'basic',
                                });
                              }
                            }}
                            onKeyDown={() => undefined}
                          >
                            all {route}
                          </em>
                        ))}
                      </span>
                    </button>

                    {open && items.map((it: ContentItem) => {
                      const rules = effectiveRules(it, contentOverrides);
                      const overridden = !!contentOverrides[it.key];
                      return (
                        <div key={it.key} className="admin-row">
                          <div className="admin-name">
                            <strong>{it.name}</strong>
                            <code>{it.id}{it.group ? ` · ${it.group}` : ''}</code>
                            <span className="admin-summary">
                              {describe({ enabled: true, routes: rules.routes, minTier: rules.minTier })}
                              {overridden && <strong> · changed</strong>}
                            </span>
                          </div>
                          <div className="admin-controls">
                            <div className="route-toggles">
                              {ROUTES.map((rt) => (
                                <button
                                  key={rt.key}
                                  className={`route-chip ${rules.routes[rt.key] ? 'on' : ''}`}
                                  title={rt.hint}
                                  aria-pressed={rules.routes[rt.key]}
                                  onClick={() =>
                                    void setContentOverride(it.key, {
                                      ...rules,
                                      routes: { ...rules.routes, [rt.key]: !rules.routes[rt.key] },
                                    })
                                  }
                                >
                                  {rt.label}
                                </button>
                              ))}
                              <button
                                className={`route-chip off ${
                                  !rules.routes.free && !rules.routes.ad && !rules.routes.paid ? 'on' : ''
                                }`}
                                title="Hide this item from everyone" aria-label="Hide this item from everyone"
                                onClick={() =>
                                  void setContentOverride(it.key, {
                                    ...rules,
                                    routes: { free: false, ad: false, paid: false },
                                  })
                                }
                              >
                                Off
                              </button>
                            </div>
                            <select
                              className="admin-tier"
                              value={rules.minTier}
                              disabled={!rules.routes.paid}
                              onChange={(e) =>
                                void setContentOverride(it.key, {
                                  ...rules,
                                  minTier: e.target.value as Tier,
                                })
                              }
                              aria-label={`Minimum tier for ${it.name}`}
                            >
                              {TIERS.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <button
                              className="btn sm"
                              disabled={!overridden}
                              title="Back to the shipped default" aria-label="Back to the shipped default"
                              onClick={() => void setContentOverride(it.key, null)}
                            >
                              ↺
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {content.length === 0 && (
                <div className="empty boxed">Loading content…</div>
              )}
            </section>
          )}

          <section className="admin-sec">
            <h3>Reset</h3>
            <p className="hint">Put every feature <em>and</em> content item back to its shipping default.</p>
            {confirmReset ? (
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <button
                  className="btn sm danger"
                  onClick={async () => {
                    await resetAll();
                    await resetContent();
                    setConfirmReset(false);
                  }}
                >
                  Yes, reset everything
                </button>
                <button className="btn sm" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setConfirmReset(true)}>
                Reset all flags
              </button>
            )}
          </section>

          <p className="hint admin-foot">
            Stored locally for now. When the backend lands this same table is
            served from the server, so a change here reaches every user without
            a redeploy.
          </p>
        </div>
      </div>
    </div>
  );
}
