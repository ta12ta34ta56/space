/**
 * Fabric-free Parametric Template Domain Model for Novelka.
 *
 * Defines validated responsive rules, content regions, slot arrangements,
 * constraints, style tokens, and spread behaviors for automated book layout.
 */

export type TemplateLifecycleStatus = 'draft' | 'published' | 'unpublished' | 'archived';
export type TemplateAccessLevel = 'free' | 'ad_unlock' | 'premium_only';

export type TemplateRegionRole =
  | 'title'
  | 'subtitle'
  | 'puzzle-grid'
  | 'word-list'
  | 'instruction'
  | 'decoration'
  | 'page-number'
  | 'solution-grid'
  | 'solution-title'
  | 'divider';

export type TemplateContentType = 'text' | 'grid' | 'word-list' | 'folio' | 'graphic' | 'rule';
export type TemplateLayoutBehavior = 'flow' | 'stacked' | 'anchored' | 'proportional' | 'fill';

export interface RegionConstraints {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  minFontSize?: number;
  maxFontSize?: number;
  minCellSize?: number;
  maxColumns?: number;
  [key: string]: unknown;
}

export interface RegionSpacing {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface TemplateRegion {
  id: string;
  role: TemplateRegionRole;
  required: boolean;
  contentType: TemplateContentType;
  anchor?: 'top' | 'bottom' | 'center' | 'relative';
  layoutBehavior: TemplateLayoutBehavior;
  constraints?: RegionConstraints;
  spacing?: RegionSpacing;
  styleTokens?: Record<string, unknown>;
}

export interface TemplateSlotRule {
  puzzlesPerPage: number;
  gridColumns: number;
  gridRows: number;
  targetGap: number;
}

export interface SpreadPageSpec {
  pageRole: 'left' | 'right';
  gutterPlacement: 'left' | 'right';
}

export interface SpreadBehavior {
  spreadId?: string;
  mirrorBehavior: 'symmetric' | 'continuous' | 'none';
  gutterSide: 'inner';
  continuationRules?: {
    splitWordBank?: boolean;
    spanTitle?: boolean;
  };
}

export interface TemplateGlobalConstraints {
  minCellSize?: number;
  minLetterSize?: number;
  minTitleSize?: number;
  minBankFontSize?: number;
  maxGridSize?: number;
  [key: string]: unknown;
}

export interface TemplatePreviewMetadata {
  svgThumb?: string;
  author?: string;
  tags?: string[];
}

export interface ParametricTemplate {
  templateId: string;
  version: string;
  name: string;
  description: string;
  generatorKinds: string[];
  pageModes: ('puzzle' | 'solution')[];
  /** Validated trim size IDs, or '*' for all supported sizes */
  supportedSizes: string[];
  regions: TemplateRegion[];
  slots: TemplateSlotRule[];
  constraints: TemplateGlobalConstraints;
  styleTokens: Record<string, unknown>;
  mirrorBehavior: 'mirror_gutter' | 'none' | 'independent';
  spreadBehavior?: SpreadBehavior;
  overflowPolicy: 'scale_down' | 'grow_columns' | 'truncate' | 'fail';
  status: TemplateLifecycleStatus;
  accessLevel: TemplateAccessLevel;
  preview?: TemplatePreviewMetadata;
}

export interface TemplateDiagnostic {
  code: string;
  severity: 'error' | 'warn';
  message: string;
  regionId?: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface TemplateValidationResult {
  valid: boolean;
  diagnostics: TemplateDiagnostic[];
}
