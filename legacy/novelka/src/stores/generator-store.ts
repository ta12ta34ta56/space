import { create } from 'zustand';

export type GeneratorId = 'sudoku' | 'wordsearch' | 'crossword' | 'maze' | 'handwriting';
export type PuzzleTemplateFilter = 'all' | 'sudoku' | 'wordsearch' | 'crossword' | 'maze';

interface GeneratorState {
  activeGenerator: GeneratorId | null;
  templates: Partial<Record<GeneratorId, string>>;
  templateBrowser: { filter: PuzzleTemplateFilter; nonce: number } | null;
  openGenerator: (id: GeneratorId | null, templateId?: string) => void;
  browseTemplates: (filter: PuzzleTemplateFilter) => void;
}

export const useGeneratorStore = create<GeneratorState>((set) => ({
  activeGenerator: null,
  templates: {},
  templateBrowser: null,
  openGenerator: (id, templateId) => {
    set((s) => ({
      activeGenerator: id,
      templates: id && templateId ? { ...s.templates, [id]: templateId } : s.templates,
    }));
  },
  browseTemplates: (filter) => {
    set({ templateBrowser: { filter, nonce: Date.now() } });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novelka:open-tool', { detail: 'templates' }));
    }
  },
}));

export function openGeneratorTool(id: GeneratorId, templateId?: string) {
  useGeneratorStore.getState().openGenerator(id, templateId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('novelka:open-tool', { detail: 'generators' }));
  }
}

export function browseGeneratorTemplates(filter: PuzzleTemplateFilter) {
  useGeneratorStore.getState().browseTemplates(filter);
}
