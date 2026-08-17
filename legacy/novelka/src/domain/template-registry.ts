import type {
  ParametricTemplate,
} from './template-types';

export const CLASSIC_WS_TEMPLATE: ParametricTemplate = {
  templateId: 'classic-ws',
  version: '1.0.0',
  name: 'Classic Word Search',
  description: 'Clean KDP word search interior with title, letter grid, 3-column word bank, and page folio.',
  generatorKinds: ['wordsearch'],
  pageModes: ['puzzle'],
  supportedSizes: ['kdp6x9', 'kdp8x10', 'kdp85x11', 'A4', 'custom7x9'],
  regions: [
    {
      id: 'reg-title',
      role: 'title',
      required: true,
      contentType: 'text',
      anchor: 'top',
      layoutBehavior: 'anchored',
      constraints: { minFontSize: 12, maxFontSize: 26 },
      spacing: { bottom: 10 },
      styleTokens: { fontFamily: 'Georgia', fontStyle: 'bold' },
    },
    {
      id: 'reg-subtitle',
      role: 'subtitle',
      required: false,
      contentType: 'text',
      anchor: 'top',
      layoutBehavior: 'flow',
      constraints: { minFontSize: 8, maxFontSize: 13 },
      spacing: { bottom: 6 },
    },
    {
      id: 'reg-grid',
      role: 'puzzle-grid',
      required: true,
      contentType: 'grid',
      anchor: 'center',
      layoutBehavior: 'proportional',
      constraints: { minCellSize: 12 },
    },
    {
      id: 'reg-bank',
      role: 'word-list',
      required: true,
      contentType: 'word-list',
      anchor: 'bottom',
      layoutBehavior: 'flow',
      constraints: { minFontSize: 7, maxColumns: 4 },
      spacing: { top: 14 },
    },
    {
      id: 'reg-folio',
      role: 'page-number',
      required: false,
      contentType: 'folio',
      anchor: 'bottom',
      layoutBehavior: 'anchored',
      constraints: { minFontSize: 9, maxFontSize: 11 },
    },
  ],
  slots: [
    { puzzlesPerPage: 1, gridColumns: 1, gridRows: 1, targetGap: 14 },
  ],
  constraints: {
    minCellSize: 12,
    minLetterSize: 6,
    minTitleSize: 10,
    minBankFontSize: 7,
  },
  styleTokens: {
    fontFamily: 'Georgia',
    letterColor: '#111827',
    gridLineColor: '#c7ced8',
    gridLineWidth: 0.6,
    frameWidth: 1.6,
    bankColumns: 3,
    bankFontSize: 11,
    gridStyle: 'plain',
    bankStyle: 'columns',
  },
  mirrorBehavior: 'mirror_gutter',
  spreadBehavior: {
    mirrorBehavior: 'symmetric',
    gutterSide: 'inner',
  },
  overflowPolicy: 'scale_down',
  status: 'published',
  accessLevel: 'free',
};

export const TWO_UP_WS_TEMPLATE: ParametricTemplate = {
  templateId: 'two-up-ws',
  version: '1.0.0',
  name: 'Two Puzzles Per Page',
  description: 'Two stacked word-search puzzles per page with separate captions and horizontal dividers.',
  generatorKinds: ['wordsearch'],
  pageModes: ['puzzle'],
  supportedSizes: ['kdp85x11', 'kdp8x10', 'A4'],
  regions: [
    {
      id: 'reg-title',
      role: 'title',
      required: true,
      contentType: 'text',
      anchor: 'top',
      layoutBehavior: 'anchored',
      constraints: { minFontSize: 14, maxFontSize: 22 },
      spacing: { bottom: 8 },
    },
    {
      id: 'reg-grid',
      role: 'puzzle-grid',
      required: true,
      contentType: 'grid',
      layoutBehavior: 'stacked',
      constraints: { minCellSize: 12 },
    },
    {
      id: 'reg-bank',
      role: 'word-list',
      required: true,
      contentType: 'word-list',
      layoutBehavior: 'flow',
      constraints: { minFontSize: 7, maxColumns: 3 },
      spacing: { top: 8 },
    },
    {
      id: 'reg-divider',
      role: 'divider',
      required: false,
      contentType: 'rule',
      layoutBehavior: 'flow',
    },
    {
      id: 'reg-folio',
      role: 'page-number',
      required: false,
      contentType: 'folio',
      anchor: 'bottom',
      layoutBehavior: 'anchored',
    },
  ],
  slots: [
    { puzzlesPerPage: 2, gridColumns: 1, gridRows: 2, targetGap: 18 },
  ],
  constraints: {
    minCellSize: 12,
    minLetterSize: 6,
    minTitleSize: 10,
    minBankFontSize: 7,
  },
  styleTokens: {
    fontFamily: 'Inter',
    letterColor: '#111827',
    gridLineColor: '#cbd5e1',
    gridLineWidth: 0.6,
    frameWidth: 1.4,
    bankColumns: 3,
    bankFontSize: 10,
    gridStyle: 'lines',
    bankStyle: 'columns',
  },
  mirrorBehavior: 'mirror_gutter',
  spreadBehavior: {
    mirrorBehavior: 'symmetric',
    gutterSide: 'inner',
  },
  overflowPolicy: 'scale_down',
  status: 'published',
  accessLevel: 'free',
};

export const ANSWERS_WS_TEMPLATE: ParametricTemplate = {
  templateId: 'answers-ws',
  version: '1.0.0',
  name: 'Answer Key Grid',
  description: 'Compact 4-up/6-up solution grids with circled answer paths.',
  generatorKinds: ['wordsearch'],
  pageModes: ['solution'],
  supportedSizes: ['kdp6x9', 'kdp8x10', 'kdp85x11', 'A4', 'custom7x9'],
  regions: [
    {
      id: 'reg-sol-title',
      role: 'solution-title',
      required: true,
      contentType: 'text',
      anchor: 'top',
      layoutBehavior: 'anchored',
      constraints: { minFontSize: 14, maxFontSize: 22 },
      spacing: { bottom: 10 },
    },
    {
      id: 'reg-sol-grid',
      role: 'solution-grid',
      required: true,
      contentType: 'grid',
      layoutBehavior: 'flow',
      constraints: { minCellSize: 7 },
    },
    {
      id: 'reg-folio',
      role: 'page-number',
      required: false,
      contentType: 'folio',
      anchor: 'bottom',
      layoutBehavior: 'anchored',
    },
  ],
  slots: [
    { puzzlesPerPage: 4, gridColumns: 2, gridRows: 2, targetGap: 14 },
    { puzzlesPerPage: 6, gridColumns: 2, gridRows: 3, targetGap: 12 },
  ],
  constraints: {
    minCellSize: 7,
    minLetterSize: 3.5,
    minTitleSize: 10,
  },
  styleTokens: {
    fontFamily: 'Inter',
    letterColor: '#111827',
    answerColor: '#d64550',
    answerStyle: 'oval',
    gridStyle: 'plain',
    showWordBank: false,
  },
  mirrorBehavior: 'mirror_gutter',
  spreadBehavior: {
    mirrorBehavior: 'symmetric',
    gutterSide: 'inner',
  },
  overflowPolicy: 'scale_down',
  status: 'published',
  accessLevel: 'free',
};

export const DRAFT_EXPERIMENT_TEMPLATE: ParametricTemplate = {
  templateId: 'draft-experiment-ws',
  version: '0.1.0',
  name: 'Experimental Draft Template',
  description: 'Unpublished draft template for authoring experiments.',
  generatorKinds: ['wordsearch'],
  pageModes: ['puzzle'],
  supportedSizes: ['kdp6x9'],
  regions: [
    {
      id: 'reg-title',
      role: 'title',
      required: true,
      contentType: 'text',
      layoutBehavior: 'anchored',
    },
    {
      id: 'reg-grid',
      role: 'puzzle-grid',
      required: true,
      contentType: 'grid',
      layoutBehavior: 'proportional',
    },
  ],
  slots: [{ puzzlesPerPage: 1, gridColumns: 1, gridRows: 1, targetGap: 14 }],
  constraints: { minCellSize: 12 },
  styleTokens: { fontFamily: 'Inter' },
  mirrorBehavior: 'mirror_gutter',
  overflowPolicy: 'scale_down',
  status: 'draft',
  accessLevel: 'free',
};

export const PARAMETRIC_TEMPLATES: ParametricTemplate[] = [
  CLASSIC_WS_TEMPLATE,
  TWO_UP_WS_TEMPLATE,
  ANSWERS_WS_TEMPLATE,
  DRAFT_EXPERIMENT_TEMPLATE,
];

/** Register or update a parametric template in the runtime registry. */
export function registerParametricTemplate(template: ParametricTemplate): void {
  const idx = PARAMETRIC_TEMPLATES.findIndex((t) => t.templateId === template.templateId);
  if (idx >= 0) {
    PARAMETRIC_TEMPLATES[idx] = template;
  } else {
    PARAMETRIC_TEMPLATES.push(template);
  }
}

/** Unregister a parametric template from the runtime registry. */
export function unregisterParametricTemplate(templateId: string): boolean {
  const idx = PARAMETRIC_TEMPLATES.findIndex((t) => t.templateId === templateId);
  if (idx >= 0) {
    PARAMETRIC_TEMPLATES.splice(idx, 1);
    return true;
  }
  return false;
}

export const LEGACY_TEMPLATE_ALIASES: Record<string, string> = {
  classic: 'classic-ws',
  'two-up': 'two-up-ws',
  answers: 'answers-ws',
};

export interface TemplateResolveQuery {
  templateId?: string;
  generatorKind?: string;
  pageMode?: 'puzzle' | 'solution';
  trimSize?: string;
  publishedOnly?: boolean;
}

export interface TemplateResolveResult {
  ok: boolean;
  template: ParametricTemplate;
  reason?: string;
  fallbackApplied: boolean;
}

/**
 * Resolve a parametric template based on generator, mode, size, and publication status.
 */
export function resolveParametricTemplate(query: TemplateResolveQuery): TemplateResolveResult {
  const publishedOnly = query.publishedOnly !== false;
  const targetMode = query.pageMode ?? 'puzzle';
  const targetKind = query.generatorKind ?? 'wordsearch';
  const targetSize = query.trimSize;

  const defaultTemplate =
    targetMode === 'solution' ? ANSWERS_WS_TEMPLATE : CLASSIC_WS_TEMPLATE;

  // 1. If explicit template ID requested
  if (query.templateId) {
    const resolvedId = LEGACY_TEMPLATE_ALIASES[query.templateId] || query.templateId;
    const found = PARAMETRIC_TEMPLATES.find((t) => t.templateId === resolvedId);

    if (!found) {
      return {
        ok: false,
        template: defaultTemplate,
        reason: `Template "${query.templateId}" not found. Falling back to "${defaultTemplate.name}".`,
        fallbackApplied: true,
      };
    }

    if (publishedOnly && found.status !== 'published') {
      return {
        ok: false,
        template: defaultTemplate,
        reason: `Template "${found.name}" is in "${found.status}" status (only published templates may be used in production). Falling back to "${defaultTemplate.name}".`,
        fallbackApplied: true,
      };
    }

    if (query.pageMode && !found.pageModes.includes(query.pageMode)) {
      return {
        ok: false,
        template: defaultTemplate,
        reason: `Template "${found.name}" does not support page mode "${query.pageMode}".`,
        fallbackApplied: true,
      };
    }

    if (targetSize && !found.supportedSizes.includes('*') && !found.supportedSizes.includes(targetSize)) {
      return {
        ok: false,
        template: defaultTemplate,
        reason: `Template "${found.name}" does not support trim size "${targetSize}". Supported sizes: ${found.supportedSizes.join(', ')}.`,
        fallbackApplied: true,
      };
    }

    return {
      ok: true,
      template: found,
      fallbackApplied: false,
    };
  }

  // 2. Select default published template matching criteria
  const match = PARAMETRIC_TEMPLATES.find((t) => {
    if (publishedOnly && t.status !== 'published') return false;
    if (!t.generatorKinds.includes(targetKind)) return false;
    if (!t.pageModes.includes(targetMode)) return false;
    if (targetSize && !t.supportedSizes.includes('*') && !t.supportedSizes.includes(targetSize)) return false;
    return true;
  });

  return {
    ok: true,
    template: match ?? defaultTemplate,
    fallbackApplied: !match,
  };
}
