import { useMemo } from 'react';
import { sanitizeSvg } from '../utils/svg-sanitize';

export function SafeSvgPreview({
  viewBox,
  markup,
  className,
  preserveAspectRatio,
}: {
  viewBox: string;
  markup: string;
  className?: string;
  preserveAspectRatio?: string;
}) {
  const inner = useMemo(() => {
    const safe = sanitizeSvg(`<svg viewBox="${viewBox}">${markup}</svg>`).svg;
    return safe
      .replace(/^<svg[^>]*>/i, '')
      .replace(/<\/svg>$/i, '');
  }, [markup, viewBox]);

  return (
    <svg
      className={className}
      viewBox={viewBox}
      preserveAspectRatio={preserveAspectRatio}
      width="100%"
      height="100%"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
