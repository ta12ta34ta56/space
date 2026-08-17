import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Reveal
 *
 * A dependency-free stand-in for a Framer Motion `whileInView` fade-up: it
 * observes the element with IntersectionObserver and, once it scrolls into
 * view, adds a class that transitions it from a soft offset to resting
 * position. `prefers-reduced-motion` users get the content instantly (handled
 * in CSS), so this never blocks reading.
 */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  /** stagger delay in ms */
  delay?: number;
  /** distance to travel up on entry, px */
  y?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -36px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`reveal ${shown ? 'reveal-in' : ''} ${className ?? ''}`}
      style={{ transitionDelay: `${delay}ms`, '--reveal-y': `${y}px` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
