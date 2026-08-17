/**
 * Offscreen page-to-image helper shared by the page strip and the continuous
 * scroll previews. Renders a stored page's Fabric JSON to a crisp PNG/JPEG at
 * the given multiplier without disturbing the live canvas.
 */
export async function renderPageImage(
  data: unknown,
  background: string | null | undefined,
  width: number,
  height: number,
  multiplier = 1,
  format: 'png' | 'jpeg' = 'png',
  quality = 0.7,
): Promise<string> {
  const fabricNs = await import('fabric');
  const el = document.createElement('canvas');
  const c = new fabricNs.StaticCanvas(el, {
    width,
    height,
    backgroundColor: background ?? '#ffffff',
  });
  await c.loadFromJSON(data as Parameters<typeof c.loadFromJSON>[0]);
  // Re-assert an OPAQUE white page surface. loadFromJSON can restore a
  // transparent/black background from a stored project, which would make the
  // thumbnail show the panel background through it — a page with no background
  // colour is always the white paper.
  c.backgroundColor = background ?? '#ffffff';
  // Never inherit the editor's zoom/pan into the thumbnail.
  c.setViewportTransform([1, 0, 0, 1, 0, 0]);
  c.renderAll();
  const url = c.toDataURL({
    format,
    quality,
    multiplier: Math.max(0.1, multiplier),
    enableRetinaScaling: false,
  });
  c.dispose();
  return url;
}
