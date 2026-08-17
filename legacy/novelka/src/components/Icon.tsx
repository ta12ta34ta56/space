interface Props {
  name: IconName;
  size?: number;
}

const P: Record<string, string> = {
  select: 'M4 3l7 17 2.5-6.5L20 11z',
  text: 'M5 5h14M12 5v14M9 19h6',
  shapes: 'M4 13h7v7H4zM14.5 4l5 8h-10z',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  sticker: 'M12 3a9 9 0 1 1-9 9h5a4 4 0 0 0 4 4v5',
  icons: 'M12 3l2.5 6H21l-5 4 2 7-6-4-6 4 2-7-5-4h6.5z',
  border: 'M3 3h18v18H3zM7 7h10v10H7z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  pages: 'M6 3h9l4 4v14H6zM15 3v5h4',
  templates: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  layoutTemplate: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  puzzlePiece: 'M10 3h4v3a2 2 0 1 0 4 0h3v4h-3a2 2 0 1 0 0 4h3v6H4v-6h3a2 2 0 1 0 0-4H4V6h3a2 2 0 1 0 4 0z',
  rowsSpacing: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M8 16v4',
  type: 'M5 5h14M12 5v14M9 19h6',
  imagePlus: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M17 7v5M14.5 9.5h5',
  upload: 'M12 17V4M7 9l5-5 5 5M4 20h16',
  undo: 'M9 10H5V6M5.5 10a8 8 0 1 1 1 8',
  redo: 'M15 10h4V6M18.5 10a8 8 0 1 0-1 8',
  trash: 'M4 6h16M9 6V4h6v2M6 6l1 15h10l1-15M10 10v8M14 10v8',
  trash2: 'M4 6h16M9 6V4h6v2M6 6l1 15h10l1-15M10 10v8M14 10v8',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  paste: 'M5 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M9 4V2h6v2 M9 11h6 M9 15h4',
  duplicate: 'M9 9h11v11H9zM4 15V4h11M12 12v5M9.5 14.5h5',
  clone: 'M9 9h11v11H9zM4 15V4h11M12 12v5M9.5 14.5h5',
  group: 'M4 4h6v6H4zM14 14h6v6h-6zM4 14h6v6H4zM14 4h6v6h-6z',
  ungroup: 'M4 4h6v6H4zM14 14h6v6h-6zM11 7h4M7 11v4',
  lock: 'M6 11h12v10H6zM9 11V7a3 3 0 0 1 6 0v4',
  unlock: 'M6 11h12v10H6zM9 11V7a3 3 0 0 1 5.5-1.7',
  eye: 'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  eyeoff: 'M4 4l16 16M9.9 5.2A9.7 9.7 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.3 3.9M6.3 7.9A17 17 0 0 0 2 12s4 7 10 7a9.6 9.6 0 0 0 3.6-.7',
  alignLeft: 'M4 3v18M8 7h11M8 13h7',
  alignCenterH: 'M12 3v18M6 7h12M8 13h8',
  alignRight: 'M20 3v18M5 7h11M9 13h7',
  alignTop: 'M3 4h18M7 8v11M13 8v7',
  alignMiddle: 'M3 12h18M7 6v12M13 8v8',
  alignBottom: 'M3 20h18M7 5v11M13 9v7',
  distH: 'M4 3v18M20 3v18M9 8h6v8H9z',
  distV: 'M3 4h18M3 20h18M8 9h8v6H8z',
  flipHorizontal2: 'M12 4v16M4 7l5 5-5 5M20 7l-5 5 5 5',
  flipVertical2: 'M4 12h16M7 4l5 5 5-5M7 20l5-5 5 5',
  front: 'M7 7h10v10H7zM4 13v7h7',
  back: 'M7 7h10v10H7zM20 11V4h-7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  grid: 'M3 9h18M3 15h18M9 3v18M15 3v18',
  list: 'M3.5 6a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1zM3.5 12a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1zM3.5 18a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1zM8 6h13M8 12h13M8 18h13',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l4.5 4.5',
  crossword: 'M3 3h6v6H3zM9 9h6v6H9zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6z',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z',
  sun: 'M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4 7 17m10-10 1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  ruler: 'M3 8h18v8H3zM7 8v4M11 8v4M15 8v4M19 8v4',
  download: 'M12 16V3M7 11l5 5 5-5M4 20h16',
  save: 'M4 4h13l3 3v13H4zM8 4v6h8V4M8 14h8v6H8z',
  folder: 'M3 6h6l2 3h10v11H3z',
  file: 'M6 3h9l4 4v14H6zM15 3v5h4',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v5l3 2',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5M8 11h6M11 8v6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z',
  italic: 'M10 4h8M6 20h8M14 4l-4 16',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
  strike: 'M5 12h14M8 8a4 4 0 0 1 8 0M8 16a4 4 0 0 0 8 0',
  color: 'M12 3l2 2-7.5 7.5a2 2 0 0 0-.5 1l-.5 3 3-.5a2 2 0 0 0 1-.5L18 8l2 2M4 20h16',
  position: 'M4 7h16M4 17h16M7 4v16M17 4v16',
  close: 'M6 6l12 12M18 6L6 18',
  play: 'M7 4l12 8-12 8z',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  shield: 'M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6z',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  puzzle: 'M10 3h4v3a2 2 0 1 0 4 0h3v4h-3a2 2 0 1 0 0 4h3v6H4v-6h3a2 2 0 1 0 0-4H4V6h3a2 2 0 1 0 4 0z',
  crop: 'M6 2v16h16M2 6h16v16',
  rotate: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  rotateCw: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  page: 'M6 3h12v18H6z',
  book: 'M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zM8 3v18',
  bookOpen: 'M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 1-2-2zM12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6',
  transparent: 'M3 3h18v18H3zM3 12h9V3M12 12h9v9',
  star: 'M12 3.2l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 3-1.1-6.1L1 9.6l6.1-.8z',
  wandSparkles: 'M4 20l10-10M12 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM18 3l.7 1.8L20.5 5l-1.8.7L18 7.5l-.7-1.8L15.5 5l1.8-.7zM19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8z',
  square: 'M5 5h14v14H5z',
  sidebar: 'M4 4h16v16H4zM9 4v16M6.5 8h.01M6.5 12h.01M6.5 16h.01',
  moreHorizontal: 'M5 12h.01M12 12h.01M19 12h.01',
  ellipsis: 'M5 12h.01M12 12h.01M19 12h.01',
  youtube: 'M4 7h16v11H4zM10 10.5l4.5 2.5L10 15.5z',
  instagram: 'M4 4h16v16H4zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM16.8 7.2h.01',
  tiktok: 'M14 3v11a3.5 3.5 0 1 1-3.5-3.5M14 3a5 5 0 0 0 5 5',
  facebook: 'M14 21v-7h3l1-4h-4V8c0-1 .3-2 2-2h2V2.5S16.8 2 15 2c-3 0-5 2-5 5.5V10H6v4h4v7z',
  x: 'M4 4l16 16M20 4L4 20',
  linkedin: 'M5 4h14v16H5zM8 10v6M8 7.5v.01M12 16v-3.5a2 2 0 0 1 4 0V16',
  github: 'M12 3a9 9 0 0 0-3 17.5c.5.1.6-.2.6-.5v-1.7c-2.6.6-3.2-1.2-3.2-1.2-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.5-1.1-4.5-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.5 5 .4.3.7.9.7 1.9V20c0 .3.1.6.6.5A9 9 0 0 0 12 3z',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  check: 'M5 13l4 4L19 7',
  sparkles: 'M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 3l.7 1.8L7.5 5.5l-1.8.7L5 8l-.7-1.8L2.5 5.5l1.8-.7z',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  keyboard: 'M3 8h18v9H3zM7 11h.01M10 11h.01M13 11h.01M16 11h.01M7 14h10',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.6 9a2.6 2.6 0 0 1 5 1c0 1.4-2 1.8-2 3M12 17h.01',
};

export type IconName = keyof typeof P | string;

export function Icon({ name, size = 16 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={P[name] ?? P.select} />
    </svg>
  );
}
