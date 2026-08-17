import { create } from 'zustand';

/** Global style defaults shared by the text tool and every tool module. */
interface TextStyleState {
  fontFamily: string;
  fontSize: number;
  fill: string;
  setFontFamily: (f: string) => void;
  setFontSize: (n: number) => void;
  setFill: (c: string) => void;
}

export const useTextStyleStore = create<TextStyleState>((set) => ({
  fontFamily: 'Inter',
  fontSize: 24,
  fill: '#111827',
  setFontFamily: (fontFamily) => set({ fontFamily }),
  setFontSize: (fontSize) => set({ fontSize }),
  setFill: (fill) => set({ fill }),
}));
