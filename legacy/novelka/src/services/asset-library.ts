/**
 * Asset library. Base assets ship in /public/assets (CRITICAL RULE #11).
 *
 * The owner's line art was supplied as PNG and vector-traced to SVG on import
 * (4.0 MB -> 0.7 MB). Every path uses fill="currentColor", so the artwork is
 * recolorable on the canvas — see engine.addSVGFromURL({ fill }).
 */

export type AssetKind = 'sticker' | 'icon' | 'border' | 'divider' | 'pattern' | 'template';
export type AccessLevel = 'free' | 'ad_unlock' | 'premium_only' | 'disabled';

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  category: string;
  src: string;
  tags: string[];
  accessLevel: AccessLevel;
  /** intrinsic pixel size, used to preserve aspect ratio on drop */
  w?: number;
  h?: number;
}

/** compact constructor for the generated PNG rows */
const a = (
  id: string,
  kind: AssetKind,
  name: string,
  category: string,
  src: string,
  w: number,
  h: number,
): Asset => ({
  id: `png:${id}`,
  kind,
  name,
  category,
  src,
  tags: [category, name.toLowerCase()],
  accessLevel: 'free',
  w,
  h,
});

/** Owner-supplied PNG artwork. */
export const PNG_ASSETS: Asset[] = [
  a('corner-b-01', 'border', "Corner B 1", 'corners', '/assets/borders-frames/corner-b-01.svg', 700, 700),
  a('corner-b-02', 'border', "Corner B 2", 'corners', '/assets/borders-frames/corner-b-02.svg', 611, 700),
  a('corner-b-03', 'border', "Corner B 3", 'corners', '/assets/borders-frames/corner-b-03.svg', 700, 700),
  a('corner-b-04', 'border', "Corner B 4", 'corners', '/assets/borders-frames/corner-b-04.svg', 700, 700),
  a('corner-c-01', 'border', "Corner C 1", 'corners', '/assets/borders-frames/corner-c-01.svg', 431, 700),
  a('corner-c-02', 'border', "Corner C 2", 'corners', '/assets/borders-frames/corner-c-02.svg', 700, 700),
  a('corner-c-03', 'border', "Corner C 3", 'corners', '/assets/borders-frames/corner-c-03.svg', 697, 700),
  a('corner-c-04', 'border', "Corner C 4", 'corners', '/assets/borders-frames/corner-c-04.svg', 700, 700),
  a('corner-a-01', 'border', "Corner A 1", 'corners', '/assets/borders-frames/corner-a-01.svg', 685, 700),
  a('corner-a-02', 'border', "Corner A 2", 'corners', '/assets/borders-frames/corner-a-02.svg', 700, 700),
  a('corner-a-03', 'border', "Corner A 3", 'corners', '/assets/borders-frames/corner-a-03.svg', 697, 700),
  a('corner-a-04', 'border', "Corner A 4", 'corners', '/assets/borders-frames/corner-a-04.svg', 699, 700),
  a('heart-01', 'sticker', "Heart 1", 'hearts', '/assets/stickers/heart-01.svg', 700, 632),
  a('heart-02', 'sticker', "Heart 2", 'hearts', '/assets/stickers/heart-02.svg', 700, 221),
  a('heart-03', 'sticker', "Heart 3", 'hearts', '/assets/stickers/heart-03.svg', 700, 648),
  a('heart-04', 'sticker', "Heart 4", 'hearts', '/assets/stickers/heart-04.svg', 700, 439),
  a('heart-05', 'sticker', "Heart 5", 'hearts', '/assets/stickers/heart-05.svg', 444, 700),
  a('space-01', 'sticker', "Space 1", 'space', '/assets/stickers/space-01.svg', 632, 700),
  a('space-02', 'sticker', "Space 2", 'space', '/assets/stickers/space-02.svg', 696, 700),
  a('space-03', 'sticker', "Space 3", 'space', '/assets/stickers/space-03.svg', 700, 631),
  a('space-04', 'sticker', "Space 4", 'space', '/assets/stickers/space-04.svg', 700, 695),
  a('space-05', 'sticker', "Space 5", 'space', '/assets/stickers/space-05.svg', 698, 700),
  a('space-06', 'sticker', "Space 6", 'space', '/assets/stickers/space-06.svg', 700, 564),
  a('space-07', 'sticker', "Space 7", 'space', '/assets/stickers/space-07.svg', 700, 700),
  a('space-08', 'sticker', "Space 8", 'space', '/assets/stickers/space-08.svg', 700, 520),
  a('star-01', 'sticker', "Star 1", 'stars', '/assets/stickers/star-01.svg', 700, 612),
  a('star-02', 'sticker', "Star 2", 'stars', '/assets/stickers/star-02.svg', 700, 618),
  a('star-03', 'sticker', "Star 3", 'stars', '/assets/stickers/star-03.svg', 700, 538),
  a('star-04', 'sticker', "Star 4", 'stars', '/assets/stickers/star-04.svg', 700, 543),
  a('star-05', 'sticker', "Star 5", 'stars', '/assets/stickers/star-05.svg', 700, 690),
  a('star-06', 'sticker', "Star 6", 'stars', '/assets/stickers/star-06.svg', 525, 700),
  a('star-07', 'sticker', "Star 7", 'stars', '/assets/stickers/star-07.svg', 420, 700),
  a('star-08', 'sticker', "Star 8", 'stars', '/assets/stickers/star-08.svg', 399, 700),
  a('doodle-01', 'sticker', "Doodle 1", 'doodles', '/assets/stickers/doodle-01.svg', 700, 684),
  a('doodle-02', 'sticker', "Doodle 2", 'doodles', '/assets/stickers/doodle-02.svg', 521, 700),
  a('doodle-03', 'sticker', "Doodle 3", 'doodles', '/assets/stickers/doodle-03.svg', 478, 700),
  a('doodle-04', 'sticker', "Doodle 4", 'doodles', '/assets/stickers/doodle-04.svg', 700, 694),
  a('doodle-05', 'sticker', "Doodle 5", 'doodles', '/assets/stickers/doodle-05.svg', 700, 632),
  a('doodle-06', 'sticker', "Doodle 6", 'doodles', '/assets/stickers/doodle-06.svg', 613, 700),
  a('doodle-07', 'sticker', "Doodle 7", 'doodles', '/assets/stickers/doodle-07.svg', 585, 700),
  a('doodle-08', 'sticker', "Doodle 8", 'doodles', '/assets/stickers/doodle-08.svg', 700, 532),
  a('checklist-01', 'sticker', "Checklist 1", 'checklist', '/assets/stickers/checklist-01.svg', 511, 700),
  a('checklist-02', 'sticker', "Checklist 2", 'checklist', '/assets/stickers/checklist-02.svg', 607, 700),
  a('checklist-03', 'sticker', "Checklist 3", 'checklist', '/assets/stickers/checklist-03.svg', 700, 570),
  a('checklist-04', 'sticker', "Checklist 4", 'checklist', '/assets/stickers/checklist-04.svg', 700, 598),
  a('time-01', 'sticker', "Time 1", 'time', '/assets/stickers/time-01.svg', 544, 700),
  a('time-02', 'sticker', "Time 2", 'time', '/assets/stickers/time-02.svg', 700, 620),
  a('time-03', 'sticker', "Time 3", 'time', '/assets/stickers/time-03.svg', 700, 649),
  a('time-04', 'sticker', "Time 4", 'time', '/assets/stickers/time-04.svg', 700, 596),
  a('object-01', 'sticker', "Object 1", 'objects', '/assets/stickers/object-01.svg', 700, 486),
  a('object-02', 'sticker', "Object 2", 'objects', '/assets/stickers/object-02.svg', 670, 700),
  a('object-03', 'sticker', "Object 3", 'objects', '/assets/stickers/object-03.svg', 700, 536),
  a('divider-b-01', 'divider', "Divider B 1", 'dividers', '/assets/dividers/divider-b-01.svg', 1400, 105),
  a('divider-b-02', 'divider', "Divider B 2", 'dividers', '/assets/dividers/divider-b-02.svg', 1400, 87),
  a('divider-b-03', 'divider', "Divider B 3", 'dividers', '/assets/dividers/divider-b-03.svg', 1400, 125),
  a('divider-b-04', 'divider', "Divider B 4", 'dividers', '/assets/dividers/divider-b-04.svg', 1400, 104),
  a('divider-b-05', 'divider', "Divider B 5", 'dividers', '/assets/dividers/divider-b-05.svg', 1400, 96),
  a('divider-b-06', 'divider', "Divider B 6", 'dividers', '/assets/dividers/divider-b-06.svg', 1400, 92),
  a('divider-b-07', 'divider', "Divider B 7", 'dividers', '/assets/dividers/divider-b-07.svg', 1400, 96),
  a('divider-b-08', 'divider', "Divider B 8", 'dividers', '/assets/dividers/divider-b-08.svg', 1400, 75),
  a('divider-b-09', 'divider', "Divider B 9", 'dividers', '/assets/dividers/divider-b-09.svg', 1400, 104),
  a('divider-b-10', 'divider', "Divider B 10", 'dividers', '/assets/dividers/divider-b-10.svg', 1400, 122),
  a('divider-b-11', 'divider', "Divider B 11", 'dividers', '/assets/dividers/divider-b-11.svg', 1400, 125),
  a('divider-c-01', 'divider', "Divider C 1", 'dividers', '/assets/dividers/divider-c-01.svg', 1400, 210),
  a('divider-c-02', 'divider', "Divider C 2", 'dividers', '/assets/dividers/divider-c-02.svg', 1400, 198),
  a('divider-c-03', 'divider', "Divider C 3", 'dividers', '/assets/dividers/divider-c-03.svg', 1400, 280),
  a('divider-c-04', 'divider', "Divider C 4", 'dividers', '/assets/dividers/divider-c-04.svg', 1400, 232),
  a('divider-c-05', 'divider', "Divider C 5", 'dividers', '/assets/dividers/divider-c-05.svg', 1400, 178),
  a('divider-a-01', 'divider', "Divider A 1", 'dividers', '/assets/dividers/divider-a-01.svg', 1400, 41),
  a('divider-a-02', 'divider', "Divider A 2", 'dividers', '/assets/dividers/divider-a-02.svg', 1400, 26),
  a('divider-a-03', 'divider', "Divider A 3", 'dividers', '/assets/dividers/divider-a-03.svg', 1400, 16),
  a('divider-a-04', 'divider', "Divider A 4", 'dividers', '/assets/dividers/divider-a-04.svg', 1400, 22),
  a('divider-a-05', 'divider', "Divider A 5", 'dividers', '/assets/dividers/divider-a-05.svg', 1400, 78),
  a('divider-a-06', 'divider', "Divider A 6", 'dividers', '/assets/dividers/divider-a-06.svg', 1400, 59),
  a('divider-a-07', 'divider', "Divider A 7", 'dividers', '/assets/dividers/divider-a-07.svg', 1400, 41),
  a('divider-a-08', 'divider', "Divider A 8", 'dividers', '/assets/dividers/divider-a-08.svg', 1400, 26),
  a('divider-a-09', 'divider', "Divider A 9", 'dividers', '/assets/dividers/divider-a-09.svg', 1400, 56),
  a('divider-a-10', 'divider', "Divider A 10", 'dividers', '/assets/dividers/divider-a-10.svg', 1400, 63),
  a('divider-a-11', 'divider', "Divider A 11", 'dividers', '/assets/dividers/divider-a-11.svg', 1400, 50),
  a('divider-a-12', 'divider', "Divider A 12", 'dividers', '/assets/dividers/divider-a-12.svg', 1400, 54),
  a('divider-a-13', 'divider', "Divider A 13", 'dividers', '/assets/dividers/divider-a-13.svg', 1400, 31),
  a('divider-a-14', 'divider', "Divider A 14", 'dividers', '/assets/dividers/divider-a-14.svg', 1400, 74),
  a('divider-a-15', 'divider', "Divider A 15", 'dividers', '/assets/dividers/divider-a-15.svg', 1400, 64),
  a('flourish-01', 'sticker', "Flourish 1", 'flourish', '/assets/stickers/flourish-01.svg', 478, 700),
  a('flourish-02', 'sticker', "Flourish 2", 'flourish', '/assets/stickers/flourish-02.svg', 569, 700),
  a('flourish-03', 'sticker', "Flourish 3", 'flourish', '/assets/stickers/flourish-03.svg', 469, 700),
  a('flourish-04', 'sticker', "Flourish 4", 'flourish', '/assets/stickers/flourish-04.svg', 700, 500),
  a('pattern-01', 'pattern', "Pattern 1", 'patterns', '/assets/patterns/pattern-01.svg', 372, 700),
  a('pattern-02', 'pattern', "Pattern 2", 'patterns', '/assets/patterns/pattern-02.svg', 337, 700),
  a('pattern-03', 'pattern', "Pattern 3", 'patterns', '/assets/patterns/pattern-03.svg', 323, 700),
  a('pattern-04', 'pattern', "Pattern 4", 'patterns', '/assets/patterns/pattern-04.svg', 228, 700),
  a('pattern-05', 'pattern', "Pattern 5", 'patterns', '/assets/patterns/pattern-05.svg', 100, 700),
  a('pattern-06', 'pattern', "Pattern 6", 'patterns', '/assets/patterns/pattern-06.svg', 395, 700),
  a('pattern-07', 'pattern', "Pattern 7", 'patterns', '/assets/patterns/pattern-07.svg', 229, 700),
  a('pattern-08', 'pattern', "Pattern 8", 'patterns', '/assets/patterns/pattern-08.svg', 317, 700),
  a('key-01', 'sticker', "Key 1", 'keys', '/assets/stickers/key-01.svg', 300, 700),
  a('key-02', 'sticker', "Key 2", 'keys', '/assets/stickers/key-02.svg', 253, 700),
  a('key-03', 'sticker', "Key 3", 'keys', '/assets/stickers/key-03.svg', 158, 700),
  a('key-04', 'sticker', "Key 4", 'keys', '/assets/stickers/key-04.svg', 272, 700),
  a('key-05', 'sticker', "Key 5", 'keys', '/assets/stickers/key-05.svg', 234, 700),
  a('key-06', 'sticker', "Key 6", 'keys', '/assets/stickers/key-06.svg', 246, 700),
  a('key-07', 'sticker', "Key 7", 'keys', '/assets/stickers/key-07.svg', 218, 700),
  a('key-08', 'sticker', "Key 8", 'keys', '/assets/stickers/key-08.svg', 280, 700),
  a('key-09', 'sticker', "Key 9", 'keys', '/assets/stickers/key-09.svg', 269, 700),
  a('key-10', 'sticker', "Key 10", 'keys', '/assets/stickers/key-10.svg', 291, 700),
  a('stuff-01', 'sticker', "Stuff 1", 'objects', '/assets/stickers/stuff-01.svg', 478, 700),
  a('stuff-02', 'sticker', "Stuff 2", 'objects', '/assets/stickers/stuff-02.svg', 570, 700),
  a('stuff-03', 'sticker', "Stuff 3", 'objects', '/assets/stickers/stuff-03.svg', 468, 700),
  a('stuff-04', 'sticker', "Stuff 4", 'objects', '/assets/stickers/stuff-04.svg', 700, 500),
];

const icon = (file: string, name: string, category = 'ui'): Asset => ({
  id: `icon:${file}`,
  kind: 'icon',
  name,
  category,
  src: `/assets/icons/${file}.svg`,
  tags: [name.toLowerCase(), category],
  accessLevel: 'free',
});

export const ICONS: Asset[] = [
  icon('arrow-right', 'Arrow'),
  icon('check', 'Check'),
  icon('close', 'Close'),
  icon('plus', 'Plus'),
  icon('info', 'Info'),
  icon('warning', 'Warning'),
  icon('clock', 'Clock'),
  icon('pin', 'Location pin'),
  icon('mail', 'Mail'),
  icon('phone', 'Phone'),
  icon('star-outline', 'Star outline'),
  icon('heart-outline', 'Heart outline'),
  icon('download', 'Download'),
  icon('search', 'Search'),
  icon('settings', 'Settings'),
  icon('user', 'User'),
  icon('calendar', 'Calendar'),
  icon('flag', 'Flag'),
  icon('lightning', 'Lightning'),
  icon('target', 'Target'),
];

export const STICKERS: Asset[] = PNG_ASSETS.filter((x) => x.kind === 'sticker');
export const BORDERS: Asset[] = PNG_ASSETS.filter((x) => x.kind === 'border');
export const DIVIDERS: Asset[] = PNG_ASSETS.filter((x) => x.kind === 'divider');
export const PATTERNS: Asset[] = PNG_ASSETS.filter((x) => x.kind === 'pattern');

export const ALL_ASSETS = [...PNG_ASSETS, ...ICONS];

export function searchAssets(list: Asset[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (x) =>
      x.name.toLowerCase().includes(q) ||
      x.category.includes(q) ||
      x.tags.some((t) => t.includes(q)),
  );
}
