import { nanoid } from 'nanoid';
import type {
  GeneratedInstance,
  InstanceRole,
  LayoutConfiguration,
  StyleConfiguration,
  UserOverrides,
  InstanceSourceData,
} from './types';

export interface InstanceMatchQuery {
  kind?: string;
  role?: InstanceRole;
  contentId?: string;
  pageId?: string;
  templateId?: string;
}

/** Create a new GeneratedInstance with standard defaults and empty objectIds for Phase 1. */
export function createGeneratedInstance(options: {
  instanceId?: string;
  kind: string;
  pageId: string;
  contentId: string;
  role: InstanceRole;
  layout?: LayoutConfiguration;
  style?: StyleConfiguration;
  source?: InstanceSourceData;
  overrides?: UserOverrides;
}): GeneratedInstance {
  return {
    instanceId: options.instanceId ?? `inst-${nanoid(8)}`,
    kind: options.kind,
    pageId: options.pageId,
    contentId: options.contentId,
    objectIds: [], // Empty in Phase 1; wired to Fabric IDs in Phase 2
    role: options.role,
    layout: options.layout ?? {},
    style: options.style ?? {
      fontFamily: 'Inter',
      letterColor: '#111827',
      gridLineColor: '#c7ced8',
      gridLineWidth: 0.6,
      frameWidth: 1.6,
      backgroundColor: null,
      fontScale: 0.56,
      letterSpacing: 0,
      letterCase: 'upper',
      gridStyle: 'plain',
      bankStyle: 'columns',
      bankColumns: 3,
      bankFontSize: 11,
      bankColor: '#111827',
      titleFontSize: 18,
      titleColor: '#111827',
      showTitle: true,
      showDifficulty: false,
      showWordBank: true,
      answerColor: '#d64550',
      answerStyle: 'oval',
    },
    source: options.source ?? {},
    overrides: options.overrides ?? { isOverridden: false },
  };
}

/** Match instances across pages matching query filters. */
export function matchInstances(
  instances: GeneratedInstance[],
  query: InstanceMatchQuery,
): GeneratedInstance[] {
  return instances.filter((inst) => {
    if (query.kind && inst.kind !== query.kind) return false;
    if (query.role && inst.role !== query.role) return false;
    if (query.contentId && inst.contentId !== query.contentId) return false;
    if (query.pageId && inst.pageId !== query.pageId) return false;
    return true;
  });
}

/** Apply partial layout or style overrides to an instance non-destructively. */
export function applyInstanceOverride(
  instance: GeneratedInstance,
  patch: {
    layout?: Partial<LayoutConfiguration>;
    style?: Partial<StyleConfiguration>;
  },
): GeneratedInstance {
  const currentOverrides = instance.overrides ?? { isOverridden: false };
  return {
    ...instance,
    overrides: {
      isOverridden: true,
      layout: { ...currentOverrides.layout, ...patch.layout },
      style: { ...currentOverrides.style, ...patch.style },
      appliedAt: new Date().toISOString(),
    },
  };
}

/** Reset overrides on an instance back to base generated state. */
export function resetInstanceOverride(instance: GeneratedInstance): GeneratedInstance {
  return {
    ...instance,
    overrides: {
      isOverridden: false,
      layout: undefined,
      style: undefined,
      customFrame: undefined,
    },
  };
}

/**
 * Migrate legacy Novelka, Minipdf, and Gridpress page metadata to domain GeneratedInstances.
 *
 * Supported legacy keys:
 * - `novelka:wordsearch-page`
 * - `minipdf:wordsearch-page`
 * - `gridpress:wordsearch-page`
 */
export function migrateLegacyMetadata(
  pageData: Record<string, unknown> | null | undefined,
  pageId: string,
): GeneratedInstance[] {
  if (!pageData) return [];

  const legacyMeta = (
    pageData['novelka:wordsearch-page'] ??
    pageData['minipdf:wordsearch-page'] ??
    pageData['gridpress:wordsearch-page']
  ) as {
    kind?: 'puzzle' | 'solution';
    puzzleIds?: string[];
    perPage?: number;
    templateId?: string;
  } | undefined;

  if (!legacyMeta || !legacyMeta.puzzleIds) {
    return [];
  }

  const kind = legacyMeta.kind === 'solution' ? 'word-search-solution' : 'word-search';
  const role: InstanceRole = legacyMeta.kind === 'solution' ? 'solution' : 'puzzle';

  return legacyMeta.puzzleIds.map((puzzleId, index) =>
    createGeneratedInstance({
      kind,
      pageId,
      contentId: puzzleId,
      role,
      layout: {
        puzzlesPerPage: legacyMeta.perPage ?? 1,
        puzzleIndex: index + 1,
      },
      source: {
        puzzleIndex: index + 1,
        rawMetadata: { legacyTemplateId: legacyMeta.templateId },
      },
    }),
  );
}
