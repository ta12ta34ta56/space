import { useState } from 'react';
import { useFlagStore } from '../stores/flag-store';
import { useAccessToken, useAuthStore } from '../stores/auth-store';
import { TIERS, type GateResult } from '../services/feature-flags';
import { isSupabaseConfigured } from '../services/auth';
import { startCheckout } from '../services/payments';
import { Icon } from './Icon';

/**
 * What a blocked user sees.
 *
 * Deliberately explains *why* and offers the way out in the same breath — a
 * disabled control with no explanation is the most common way a paid product
 * loses a customer who was ready to pay.
 *
 * The ad here is a placeholder: it waits, then grants the unlock. Swapping in
 * a real network is a change to `watchAd()` alone.
 */

export function UpgradePrompt({
  gate,
  featureKey,
  onClose,
  onUnlocked,
}: {
  gate: GateResult;
  /** feature id, or a content key for template/asset unlocks */
  featureKey: string;
  onClose: () => void;
  onUnlocked?: () => void;
}) {
  const { grantAdUnlock } = useFlagStore();
  // Route the plan change through auth when signed in, so it survives a reload
  // and follows the account rather than the browser.
  const setTier = useAuthStore((s) => s.setTier);
  const accessToken = useAccessToken();
  const [watching, setWatching] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [checkoutError, setCheckoutError] = useState('');

  const watchAd = async () => {
    setWatching(true);
    // Placeholder for a real ad network. Counting down visibly matters: an ad
    // that finishes instantly reads as broken.
    for (let s = 5; s > 0; s--) {
      setSecondsLeft(s);
      await new Promise((r) => setTimeout(r, 1000));
    }
    await grantAdUnlock(featureKey);
    setWatching(false);
    onUnlocked?.();
    onClose();
  };

  const upgrade = async (tier: string) => {
    setCheckoutError('');
    // Real money path: the server creates the Stripe Checkout session and the
    // browser is redirected to Stripe. The tier only changes when the verified
    // webhook writes it — returning from Stripe proves nothing by itself.
    if (isSupabaseConfigured()) {
      if (!accessToken) {
        setCheckoutError('Sign in first, then upgrade — your plan follows your account.');
        return;
      }
      try {
        await startCheckout(tier as never, accessToken);
        // startCheckout redirects; if we get here the redirect was blocked.
        setCheckoutError('Checkout could not be opened. Try again in a moment.');
      } catch (e) {
        setCheckoutError(e instanceof Error ? e.message : 'Checkout could not be opened.');
      }
      return;
    }
    // No server configured: simulate a successful subscription so the
    // entitlement path can be exercised end to end.
    await setTier(tier as never);
    onUnlocked?.();
    onClose();
  };

  const target = TIERS.find((t) => t.id === gate.upgradeTo) ?? TIERS[1];

  // Show exactly the doors that are actually open. `canWatchAd`/`canUpgrade`
  // come from the gate, so a feature configured as "ad or paid" offers both
  // and one configured as paid-only never dangles an ad the user cannot use.
  const showAd = gate.canWatchAd ?? gate.status === 'needs_ad';
  const showPlans =
    gate.status !== 'hidden' && (gate.canUpgrade ?? gate.status !== 'needs_ad');

  return (
    <div className="modal-backdrop" onClick={watching ? undefined : onClose}>
      <div className="modal upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>
            {gate.status === 'needs_ad' && 'Unlock with an ad'}
            {gate.status === 'needs_ad_or_upgrade' && 'Two ways to unlock this'}
            {gate.status === 'needs_upgrade' && 'Upgrade to continue'}
            {gate.status === 'limit_reached' && "You've hit today's limit"}
            {gate.status === 'hidden' && 'Not available'}
          </span>
          {!watching && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        <div className="modal-body">
          <p className="upgrade-reason">{gate.reason}</p>

          {watching ? (
            <div className="ad-playing">
              <div className="ad-spinner" />
              <strong>Advertisement</strong>
              <p className="hint">Unlocking in {secondsLeft}…</p>
            </div>
          ) : (
            <>
              {showAd && (
                <button className="btn primary lg" style={{ width: '100%' }} onClick={watchAd}>
                  <Icon name="play" size={15} /> Watch a short ad
                  <span className="ad-sub">free, takes 5 seconds</span>
                </button>
              )}

              {showPlans && (
                <>
                  <div className="upgrade-or">
                    <span>{showAd ? 'or never see an ad again' : 'choose a plan'}</span>
                  </div>

                  <div className="plan-grid">
                    {TIERS.filter((t) => t.id !== 'free').map((t) => (
                      <button
                        key={t.id}
                        className={`plan-card ${t.id === target.id ? 'featured' : ''}`}
                        onClick={() => void upgrade(t.id)}
                      >
                        <strong>{t.name}</strong>
                        <span className="plan-price">{t.price}</span>
                        <span className="hint">{t.blurb}</span>
                        {t.id === target.id && <em className="plan-tag">Unlocks this</em>}
                      </button>
                    ))}
                  </div>

                  {checkoutError && (
                    <p className="auth-error" style={{ marginTop: 10 }}>
                      {checkoutError}
                    </p>
                  )}
                  <p className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
                    {isSupabaseConfigured()
                      ? 'You will finish payment on Stripe’s secure page. Your plan activates when the payment is confirmed.'
                      : 'Payments are not connected yet — choosing a plan switches this browser to that tier so you can try it.'}
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small padlock badge for a gated tile. */
export function LockBadge({ gate }: { gate: GateResult }) {
  if (gate.allowed) return null;
  if (gate.status === 'needs_ad') return <em className="tile-lock">AD</em>;
  if (gate.status === 'hidden') return <em className="tile-lock off">OFF</em>;
  return <em className="tile-lock pro">PRO</em>;
}
