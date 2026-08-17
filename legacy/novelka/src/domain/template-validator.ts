import type {
  ParametricTemplate,
  TemplateDiagnostic,
  TemplateValidationResult,
} from './template-types';

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const VALID_LIFECYCLES = new Set(['draft', 'published', 'unpublished', 'archived']);
const VALID_ACCESS_LEVELS = new Set(['free', 'ad_unlock', 'premium_only']);
const VALID_PAGE_MODES = new Set(['puzzle', 'solution']);
const VALID_REGION_ROLES = new Set([
  'title',
  'subtitle',
  'puzzle-grid',
  'word-list',
  'instruction',
  'decoration',
  'page-number',
  'solution-grid',
  'solution-title',
  'divider',
]);

/**
 * Pure validator for ParametricTemplate definitions.
 */
export function validateTemplate(template: ParametricTemplate): TemplateValidationResult {
  const diagnostics: TemplateDiagnostic[] = [];

  // 1. Core Metadata
  if (!template.templateId || typeof template.templateId !== 'string' || !template.templateId.trim()) {
    diagnostics.push({
      code: 'INVALID_TEMPLATE_ID',
      severity: 'error',
      field: 'templateId',
      message: 'Template ID must be a non-empty string.',
    });
  }

  if (!template.version || !SEMVER_REGEX.test(template.version)) {
    diagnostics.push({
      code: 'INVALID_VERSION',
      severity: 'error',
      field: 'version',
      message: `Template version "${template.version}" is not a valid semantic version (e.g. 1.0.0).`,
    });
  }

  if (!template.name || typeof template.name !== 'string' || !template.name.trim()) {
    diagnostics.push({
      code: 'INVALID_NAME',
      severity: 'error',
      field: 'name',
      message: 'Template name is required.',
    });
  }

  if (!VALID_LIFECYCLES.has(template.status)) {
    diagnostics.push({
      code: 'INVALID_LIFECYCLE_STATUS',
      severity: 'error',
      field: 'status',
      message: `Invalid template lifecycle status "${template.status}". Must be draft, published, unpublished, or archived.`,
    });
  }

  if (!VALID_ACCESS_LEVELS.has(template.accessLevel)) {
    diagnostics.push({
      code: 'INVALID_ACCESS_LEVEL',
      severity: 'error',
      field: 'accessLevel',
      message: `Invalid template access level "${template.accessLevel}". Must be free, ad_unlock, or premium_only.`,
    });
  }

  // 2. Compatibility & Page Modes
  if (!Array.isArray(template.generatorKinds) || template.generatorKinds.length === 0) {
    diagnostics.push({
      code: 'MISSING_GENERATOR_KINDS',
      severity: 'error',
      field: 'generatorKinds',
      message: 'Template must declare at least one compatible generator kind.',
    });
  }

  if (!Array.isArray(template.pageModes) || template.pageModes.length === 0 || !template.pageModes.every((m) => VALID_PAGE_MODES.has(m))) {
    diagnostics.push({
      code: 'INVALID_PAGE_MODES',
      severity: 'error',
      field: 'pageModes',
      message: 'Template must support at least one valid page mode ("puzzle" or "solution").',
    });
  }

  if (!Array.isArray(template.supportedSizes) || template.supportedSizes.length === 0) {
    diagnostics.push({
      code: 'MISSING_SUPPORTED_SIZES',
      severity: 'error',
      field: 'supportedSizes',
      message: 'Template must declare supported trim sizes or ["*"].',
    });
  }

  // 3. Regions Validation
  if (!Array.isArray(template.regions) || template.regions.length === 0) {
    diagnostics.push({
      code: 'MISSING_REGIONS',
      severity: 'error',
      field: 'regions',
      message: 'Template must declare at least one content region.',
    });
  } else {
    const regionIds = new Set<string>();
    const roles = new Set<string>();

    template.regions.forEach((region, idx) => {
      // Duplicate ID check
      if (!region.id || regionIds.has(region.id)) {
        diagnostics.push({
          code: 'DUPLICATE_REGION_ID',
          severity: 'error',
          regionId: region.id || `region-${idx}`,
          field: 'id',
          message: `Region ID "${region.id}" is missing or duplicate.`,
        });
      } else {
        regionIds.add(region.id);
      }

      // Valid role check
      if (!VALID_REGION_ROLES.has(region.role)) {
        diagnostics.push({
          code: 'INVALID_REGION_ROLE',
          severity: 'error',
          regionId: region.id,
          field: 'role',
          message: `Invalid region role "${region.role}".`,
        });
      } else {
        roles.add(region.role);
      }

      // Constraints sanity check
      if (region.constraints) {
        const c = region.constraints;
        if (c.minWidth !== undefined && c.maxWidth !== undefined && c.minWidth > c.maxWidth) {
          diagnostics.push({
            code: 'INVALID_REGION_CONSTRAINTS',
            severity: 'error',
            regionId: region.id,
            message: `Region minWidth (${c.minWidth}pt) exceeds maxWidth (${c.maxWidth}pt).`,
          });
        }
        if (c.minHeight !== undefined && c.maxHeight !== undefined && c.minHeight > c.maxHeight) {
          diagnostics.push({
            code: 'INVALID_REGION_CONSTRAINTS',
            severity: 'error',
            regionId: region.id,
            message: `Region minHeight (${c.minHeight}pt) exceeds maxHeight (${c.maxHeight}pt).`,
          });
        }
        if (c.minFontSize !== undefined && c.minFontSize <= 0) {
          diagnostics.push({
            code: 'INVALID_REGION_CONSTRAINTS',
            severity: 'error',
            regionId: region.id,
            message: 'minFontSize must be greater than 0.',
          });
        }
      }

      // Spacing sanity check
      if (region.spacing) {
        const s = region.spacing;
        if ((s.top !== undefined && s.top < 0) || (s.bottom !== undefined && s.bottom < 0) || (s.left !== undefined && s.left < 0) || (s.right !== undefined && s.right < 0)) {
          diagnostics.push({
            code: 'NEGATIVE_SPACING',
            severity: 'error',
            regionId: region.id,
            message: 'Region spacing values must be non-negative.',
          });
        }
      }
    });

    // Check required regions for page modes
    if (template.pageModes.includes('puzzle')) {
      const hasGrid = roles.has('puzzle-grid');
      if (!hasGrid) {
        diagnostics.push({
          code: 'MISSING_REQUIRED_REGION',
          severity: 'error',
          field: 'regions',
          message: 'Puzzle template is missing required "puzzle-grid" region.',
        });
      }
    }

    if (template.pageModes.includes('solution')) {
      const hasSolGrid = roles.has('solution-grid') || roles.has('puzzle-grid');
      if (!hasSolGrid) {
        diagnostics.push({
          code: 'MISSING_REQUIRED_REGION',
          severity: 'error',
          field: 'regions',
          message: 'Solution template is missing required "solution-grid" region.',
        });
      }
    }
  }

  // 4. Slots Configuration
  if (!Array.isArray(template.slots) || template.slots.length === 0) {
    diagnostics.push({
      code: 'MISSING_SLOTS',
      severity: 'error',
      field: 'slots',
      message: 'Template must declare at least one slot configuration.',
    });
  } else {
    template.slots.forEach((slot, sIdx) => {
      if (slot.puzzlesPerPage < 1 || slot.gridColumns < 1 || slot.gridRows < 1 || slot.targetGap < 0) {
        diagnostics.push({
          code: 'INVALID_SLOT_RULE',
          severity: 'error',
          field: `slots[${sIdx}]`,
          message: 'Slot rules must have positive puzzlesPerPage, gridColumns, gridRows, and non-negative targetGap.',
        });
      }
    });
  }

  // 5. Global Constraints Sanity
  if (template.constraints) {
    const gc = template.constraints;
    if (gc.minCellSize !== undefined && (gc.minCellSize < 4 || gc.minCellSize > 60)) {
      diagnostics.push({
        code: 'IMPOSSIBLE_MIN_SIZE',
        severity: 'error',
        field: 'constraints.minCellSize',
        message: `minCellSize (${gc.minCellSize}pt) must be between 4pt and 60pt.`,
      });
    }
    if (gc.minLetterSize !== undefined && (gc.minLetterSize < 2 || gc.minLetterSize > 30)) {
      diagnostics.push({
        code: 'IMPOSSIBLE_MIN_SIZE',
        severity: 'error',
        field: 'constraints.minLetterSize',
        message: `minLetterSize (${gc.minLetterSize}pt) must be between 2pt and 30pt.`,
      });
    }
  }

  // 6. Spread Behavior Sanity
  if (template.spreadBehavior) {
    if (template.spreadBehavior.gutterSide !== 'inner') {
      diagnostics.push({
        code: 'UNSAFE_GUTTER_BEHAVIOR',
        severity: 'error',
        field: 'spreadBehavior.gutterSide',
        message: 'Two-page spread gutter side must be "inner".',
      });
    }
  }

  const valid = !diagnostics.some((d) => d.severity === 'error');

  return {
    valid,
    diagnostics,
  };
}
