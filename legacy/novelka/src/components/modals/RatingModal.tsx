import { useState } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import { isSupabaseConfigured } from '../../services/auth';
import { submitRating } from '../../services/payments';
import {
  saveRatingLocal,
  markRatingDismissed,
} from '../../services/ratings';
import { Icon } from '../Icon';

/**
 * Rate Novelka — 1 to 5 stars, optional comment and email.
 *
 * Always stored in this browser; when the server is configured the rating is
 * also sent to `/api/rating` so the owner can read real feedback. A failed
 * network call never blocks the user — the local rating stands.
 */

export function RatingModal({ onClose }: { onClose: () => void }) {
  const session = useAuthStore((s) => s.session);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (stars < 1) {
      setError('Tap a star first — even one star helps.');
      return;
    }
    setBusy(true);
    setError('');
    const entry = saveRatingLocal({
      stars,
      comment: comment.trim() || undefined,
      email: email.trim() || undefined,
    });
    // Server sync is best-effort: the local rating is already saved.
    if (isSupabaseConfigured()) {
      try {
        await submitRating({
          stars: entry.stars,
          comment: entry.comment,
          email: entry.email,
        });
      } catch {
        /* local copy stands; next launch retries when they rate again */
      }
    }
    setBusy(false);
    setSent(true);
  };

  const dismiss = () => {
    markRatingDismissed();
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal rating-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{sent ? 'Thank you!' : 'Rate Novelka'}</span>
          {!busy && (
            <button className="icon-btn" onClick={dismiss} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        <div className="modal-body">
          {sent ? (
            <div className="rating-thanks">
              <div className="rating-stars big" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} filled={n <= stars} size={30} />
                ))}
              </div>
              <strong>
                {stars >= 4
                  ? 'That means a lot — thank you!'
                  : 'Thank you for the honest feedback.'}
              </strong>
              <p className="hint">
                {stars >= 4
                  ? 'If you have a moment, telling someone about Novelka helps a student builder more than anything.'
                  : 'Every rating is read. What would make Novelka worth five stars for you?'}
              </p>
              <button className="btn primary" onClick={onClose} style={{ marginTop: 8 }}>
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
                Made something with Novelka? A quick rating helps me know what
                to build next.
              </p>

              <div
                className="rating-stars big"
                onMouseLeave={() => setHover(0)}
                role="radiogroup"
                aria-label="Your rating"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="star-btn"
                    onClick={() => setStars(n)}
                    onMouseEnter={() => setHover(n)}
                    role="radio"
                    aria-checked={stars === n}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  >
                    <Star filled={n <= (hover || stars)} size={30} />
                  </button>
                ))}
              </div>

              <span className="label" style={{ marginTop: 12 }}>Comment (optional)</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="What did you make? What should improve?"
              />

              <span className="label" style={{ marginTop: 10 }}>Email (optional)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Only if you want an answer"
                autoComplete="email"
              />
              <p className="hint" style={{ marginTop: 4 }}>
                {session
                  ? 'Prefilled from your account — change it or clear it if you prefer.'
                  : 'Never shown publicly; used only to reply to your feedback.'}
              </p>

              {error && <div className="auth-error">{error}</div>}

              <div className="row" style={{ marginTop: 14, gap: 8 }}>
                <button className="btn" style={{ flex: 1 }} onClick={dismiss} disabled={busy}>
                  Not now
                </button>
                <button className="btn primary" style={{ flex: 1 }} onClick={submit} disabled={busy}>
                  {busy ? 'Sending…' : 'Send rating'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** One star, filled or outline. */
function Star({ filled, size = 20 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
    >
      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 3-1.1-6.1L1 9.6l6.1-.8z" />
    </svg>
  );
}
