import { LOCAL_FONTS } from './local-fonts';

/**
 * Global font system. Modules and the text tool both read from here
 * (CRITICAL RULE #3 — font consistency).
 *
 * Three sources feed this registry:
 *   local    — files in public/assets/fonts (run `npm run fonts` after adding)
 *   google   — lazily loaded from Google Fonts
 *   system   — always available
 *   uploaded — added at runtime by the user
 */

export interface FontDef {
  family: string;
  label: string;
  source: 'local' | 'google' | 'system' | 'uploaded';
  category: 'sans' | 'serif' | 'display' | 'mono' | 'handwriting' | 'local';
  url?: string;
  loaded: boolean;
  /** for local families: the individual weight/style files */
  faces?: { src: string; weight: string; style: string }[];
}

const GOOGLE = (family: string, category: FontDef['category'], weights = '400;700'): FontDef => ({
  family,
  label: family,
  source: 'google',
  category,
  url: `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:ital,wght@0,${weights.split(';').join(';0,')};1,${weights.split(';').join(';1,')}&display=swap`,
  loaded: false,
});

export const FONTS: FontDef[] = [
  { family: 'Inter', label: 'Inter', source: 'google', category: 'sans', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap', loaded: false },
  GOOGLE('Poppins', 'sans'),
  GOOGLE('Montserrat', 'sans'),
  GOOGLE('Nunito', 'sans'),
  GOOGLE('Roboto Slab', 'serif'),
  GOOGLE('Playfair Display', 'serif'),
  GOOGLE('Merriweather', 'serif'),
  GOOGLE('Lora', 'serif'),
  GOOGLE('Bebas Neue', 'display', '400'),
  GOOGLE('Fredoka', 'display'),
  GOOGLE('Caveat', 'handwriting'),
  GOOGLE('Patrick Hand', 'handwriting', '400'),
  GOOGLE('JetBrains Mono', 'mono'),
  GOOGLE('Courier Prime', 'mono'),
  { family: 'Arial', label: 'Arial', source: 'system', category: 'sans', loaded: true },
  { family: 'Georgia', label: 'Georgia', source: 'system', category: 'serif', loaded: true },
  { family: 'Times New Roman', label: 'Times New Roman', source: 'system', category: 'serif', loaded: true },
  { family: 'Verdana', label: 'Verdana', source: 'system', category: 'sans', loaded: true },
];

/** Families found in public/assets/fonts — these come first in the picker. */
const LOCAL: FontDef[] = LOCAL_FONTS.map((f) => ({
  family: f.family,
  label: f.family,
  source: 'local' as const,
  category: 'local' as const,
  loaded: false,
  faces: f.faces.map((x) => ({ src: x.src, weight: x.weight, style: x.style })),
}));

const LOCAL_FAMILIES = new Set(LOCAL.map((f) => f.family));
const REMOTE_FONTS = FONTS.filter((f) => !LOCAL_FAMILIES.has(f.family));
FONTS.splice(0, FONTS.length, ...LOCAL, ...REMOTE_FONTS);

const injected = new Set<string>();

const fontWeightNumber = (weight: unknown): number => {
  if (weight === 'bold') return 700;
  if (weight === 'normal' || weight === undefined || weight === null) return 400;
  const n = Number(weight);
  return Number.isFinite(n) ? n : 400;
};

export function findFontFace(
  family: string | undefined,
  weight: unknown = 400,
  style: unknown = 'normal',
): { src: string; weight: string; style: string } | null {
  if (!family) return null;
  const def = FONTS.find((f) => f.family === family);
  if (!def?.faces?.length) return null;
  const targetStyle = style === 'italic' ? 'italic' : 'normal';
  const targetWeight = fontWeightNumber(weight);
  const exactStyle = def.faces.filter((face) => face.style === targetStyle);
  if (!exactStyle.length) return null;
  return [...exactStyle].sort(
    (a, b) => Math.abs(Number(a.weight) - targetWeight) - Math.abs(Number(b.weight) - targetWeight),
  )[0] ?? null;
}

export async function loadFontVariant(
  family: string | undefined,
  weight: unknown = 400,
  style: unknown = 'normal',
): Promise<void> {
  if (!family) return;
  await loadFont(family);
  try {
    const cssWeight = fontWeightNumber(weight);
    const cssStyle = style === 'italic' ? 'italic' : 'normal';
    await document.fonts.load(`${cssStyle} ${cssWeight} 16px "${family}"`);
    await document.fonts.ready;
  } catch {
    /* variant loading is best-effort; browser synthesis is the fallback */
  }
}

export async function loadFont(family: string): Promise<void> {
  const def = FONTS.find((f) => f.family === family);
  if (!def || def.loaded) return;
  // No FontFaceSet (SSR, node unit tests, jsdom without the fonts API): the
  // callers (template builders, thumbnail renderer) still work — they just
  // fall back to whatever generic font the environment can measure.
  if (typeof document === 'undefined' || !document.fonts) return;

  // Local files: register every weight/style as its own FontFace.
  if (def.source === 'local' && def.faces?.length) {
    await Promise.all(
      def.faces.map(async (face) => {
        const key = `${family}|${face.weight}|${face.style}`;
        if (injected.has(key)) return;
        injected.add(key);
        try {
          const ff = new FontFace(family, `url(${face.src})`, {
            weight: face.weight,
            style: face.style,
          });
          await ff.load();
          document.fonts.add(ff);
        } catch {
          /* a bad/placeholder file shouldn't break the picker */
        }
      }),
    );
    def.loaded = true;
    return;
  }

  if (!def.url) return;
  if (!injected.has(def.url)) {
    injected.add(def.url);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = def.url;
    document.head.appendChild(link);
  }
  try {
    await document.fonts.load(`16px "${family}"`);
    await document.fonts.load(`700 16px "${family}"`);
    await document.fonts.ready;
  } catch {
    /* font loading is best-effort */
  }
  def.loaded = true;
}

export async function preloadDefaultFonts() {
  const first = LOCAL.slice(0, 4).map((f) => f.family);
  await Promise.all([...first, 'Inter', 'Poppins', 'Fredoka'].map(loadFont));
}

/** True when the owner has dropped font files into public/assets/fonts. */
export const HAS_LOCAL_FONTS = LOCAL.length > 0;
export const LOCAL_FONT_COUNT = LOCAL.length;

/** Register an uploaded font file (premium feature in the flag system). */
export async function registerUploadedFont(file: File): Promise<FontDef> {
  const family = file.name.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, '');
  const url = URL.createObjectURL(file);
  const face = new FontFace(family, `url(${url})`);
  await face.load();
  document.fonts.add(face);
  const def: FontDef = {
    family,
    label: family,
    source: 'uploaded',
    category: 'sans',
    loaded: true,
    faces: [{ src: url, weight: '400', style: 'normal' }],
  };
  FONTS.push(def);
  return def;
}
