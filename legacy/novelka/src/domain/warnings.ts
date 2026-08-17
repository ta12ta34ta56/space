import type { LayoutWarning, LayoutWarningCode } from './types';

export const WARNING_CODES = {
  GRID_BELOW_MINIMUM: 'GRID_BELOW_MINIMUM',
  WORD_LIST_OVERFLOW: 'WORD_LIST_OVERFLOW',
  TITLE_OVERFLOW: 'TITLE_OVERFLOW',
  GUTTER_COLLISION: 'GUTTER_COLLISION',
  SAFE_AREA_COLLISION: 'SAFE_AREA_COLLISION',
  UNREADABLE_TEXT: 'UNREADABLE_TEXT',
  CONTENT_DOES_NOT_FIT: 'CONTENT_DOES_NOT_FIT',
  MISSING_SOLUTION: 'MISSING_SOLUTION',
  TEMPLATE_FALLBACK: 'TEMPLATE_FALLBACK',
} as const;

export function createWarning(
  code: LayoutWarningCode,
  message: string,
  severity: 'error' | 'warn' = 'warn',
  details?: Record<string, unknown>,
  instanceId?: string,
  field?: string,
): LayoutWarning {
  return {
    code,
    message,
    severity,
    instanceId,
    field,
    details,
  };
}

export function hasErrors(warnings: LayoutWarning[]): boolean {
  return warnings.some((w) => w.severity === 'error');
}

export function filterWarningsByCode(
  warnings: LayoutWarning[],
  code: LayoutWarningCode,
): LayoutWarning[] {
  return warnings.filter((w) => w.code === code);
}
