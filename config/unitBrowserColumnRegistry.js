'use strict';

const COLUMN_KIND = Object.freeze({
  CORE: 'core',
  OPTIONAL: 'optional'
});

const STRUCTURAL_REGION = Object.freeze({
  LEADING: 'leading',
  CONFIGURABLE: 'configurable',
  TRAILING: 'trailing'
});

const MAX_VISIBLE_OPTIONAL_COLUMNS = 4;

function defineColumn(definition) {
  return Object.freeze({
    defaultVisible: true,
    defaultOrder: null,
    spacingProfile: 'standard',
    valueWrapMode: 'natural',
    growthUnits: 1,
    ...definition
  });
}

const UNIT_BROWSER_COLUMN_REGISTRY = Object.freeze([
  defineColumn({
    key: 'unit_weight',
    label: 'Unit / Weight',
    kind: COLUMN_KIND.CORE,
    structuralRegion: STRUCTURAL_REGION.LEADING,
    structuralOrder: 10,
    minimumWidthPx: 445,
    spacingProfile: 'wide',
    growthUnits: 0,
    description: 'Existing Unit summary, Lot and Category context, parked/closed state, and production weight presentation.'
  }),
  defineColumn({
    key: 'created_work_assignment',
    label: 'Created / Assignment',
    kind: COLUMN_KIND.CORE,
    structuralRegion: STRUCTURAL_REGION.LEADING,
    structuralOrder: 20,
    minimumWidthPx: 175,
    spacingProfile: 'standard',
    description: 'Created date/time plus the existing assignment presentation. Both existing sort capabilities remain available when rendering is connected.'
  }),
  defineColumn({
    key: 'identifiers',
    label: 'Identifiers',
    kind: COLUMN_KIND.CORE,
    structuralRegion: STRUCTURAL_REGION.LEADING,
    structuralOrder: 30,
    minimumWidthPx: 205,
    spacingProfile: 'compact',
    valueWrapMode: 'copy_single_line',
    growthUnits: 1,
    description: 'BWT Asset, permanent AZ tag when present, BIOS Serial, and Unit Serial.'
  }),
  defineColumn({
    key: 'grade_pass_fail',
    label: 'Grade / Pass-Fail',
    kind: COLUMN_KIND.OPTIONAL,
    structuralRegion: STRUCTURAL_REGION.CONFIGURABLE,
    defaultVisible: true,
    defaultOrder: 10,
    minimumWidthPx: 105,
    spacingProfile: 'compact',
    description: 'Existing combined Grade and Pass/Fail presentation.'
  }),
  defineColumn({
    key: 'qc',
    label: 'QC',
    kind: COLUMN_KIND.OPTIONAL,
    structuralRegion: STRUCTURAL_REGION.CONFIGURABLE,
    defaultVisible: true,
    defaultOrder: 20,
    minimumWidthPx: 44,
    spacingProfile: 'tight',
    growthUnits: 0,
    description: 'Existing compact Quality Control status presentation.'
  }),
  defineColumn({
    key: 'amazon_ids',
    label: 'Amazon IDs',
    kind: COLUMN_KIND.OPTIONAL,
    structuralRegion: STRUCTURAL_REGION.CONFIGURABLE,
    defaultVisible: false,
    defaultOrder: 30,
    minimumWidthPx: 145,
    spacingProfile: 'compact',
    valueWrapMode: 'copy_single_line',
    description: 'FNSKU and ASIN in one compact stacked display group.'
  }),
  defineColumn({
    key: 'amazon_logistics',
    label: 'Amazon Logistics',
    kind: COLUMN_KIND.OPTIONAL,
    structuralRegion: STRUCTURAL_REGION.CONFIGURABLE,
    defaultVisible: false,
    defaultOrder: 40,
    minimumWidthPx: 200,
    spacingProfile: 'compact',
    valueWrapMode: 'copy_single_line',
    description: 'Tracking Number and current Pallet Number in one compact stacked display group.'
  }),
  defineColumn({
    key: 'completion',
    label: 'Completion',
    kind: COLUMN_KIND.OPTIONAL,
    structuralRegion: STRUCTURAL_REGION.CONFIGURABLE,
    defaultVisible: false,
    defaultOrder: 50,
    minimumWidthPx: 155,
    spacingProfile: 'compact',
    growthUnits: 1,
    description: 'Current completion state, completed-by technician, and completion date/time.'
  }),
  defineColumn({
    key: 'system_bios',
    label: 'System / BIOS',
    kind: COLUMN_KIND.OPTIONAL,
    structuralRegion: STRUCTURAL_REGION.CONFIGURABLE,
    defaultVisible: false,
    defaultOrder: 60,
    minimumWidthPx: 185,
    spacingProfile: 'compact',
    valueWrapMode: 'copy_single_line',
    description: 'Operating-system build, BIOS version, and Apple model number when recorded.'
  }),
  defineColumn({
    key: 'display_power',
    label: 'Display / Power',
    kind: COLUMN_KIND.OPTIONAL,
    structuralRegion: STRUCTURAL_REGION.CONFIGURABLE,
    defaultVisible: false,
    defaultOrder: 70,
    minimumWidthPx: 175,
    spacingProfile: 'standard',
    growthUnits: 1,
    description: 'Display type/resolution/refresh rate with current battery health and charger state.'
  }),
  defineColumn({
    key: 'security_locks',
    label: 'Security / Locks',
    kind: COLUMN_KIND.OPTIONAL,
    structuralRegion: STRUCTURAL_REGION.CONFIGURABLE,
    defaultVisible: false,
    defaultOrder: 80,
    minimumWidthPx: 165,
    spacingProfile: 'compact',
    description: 'BIOS, EFI, MDM, iCloud activation, and Absolute/security status when available.'
  }),
  defineColumn({
    key: 'comments',
    label: 'Comments',
    kind: COLUMN_KIND.OPTIONAL,
    structuralRegion: STRUCTURAL_REGION.CONFIGURABLE,
    defaultVisible: false,
    defaultOrder: 90,
    minimumWidthPx: 125,
    spacingProfile: 'compact',
    growthUnits: 0,
    description: 'Compact comment links. Comment text will use an overlay tooltip rather than expanding Browser rows.'
  }),
  defineColumn({
    key: 'unit_actions',
    label: 'Unit Actions',
    kind: COLUMN_KIND.CORE,
    structuralRegion: STRUCTURAL_REGION.TRAILING,
    structuralOrder: 90,
    minimumWidthPx: 180,
    spacingProfile: 'actions',
    growthUnits: 0,
    description: 'Existing Unit actions with current permission and lifecycle behavior.'
  })
]);

const COLUMNS_BY_KEY = new Map(
  UNIT_BROWSER_COLUMN_REGISTRY.map((column) => [column.key, column])
);

function assertValidUnitBrowserColumnRegistry(registry = UNIT_BROWSER_COLUMN_REGISTRY) {
  if (!Array.isArray(registry) || registry.length === 0) {
    throw new Error('Unit Browser column registry must be a non-empty array.');
  }

  const keys = new Set();
  const optionalOrders = new Set();

  for (const column of registry) {
    if (!column || typeof column !== 'object') {
      throw new Error('Each Unit Browser column definition must be an object.');
    }

    if (!/^[a-z][a-z0-9_]*$/.test(String(column.key || ''))) {
      throw new Error(`Invalid Unit Browser column key: ${column.key || '(blank)'}`);
    }

    if (keys.has(column.key)) {
      throw new Error(`Duplicate Unit Browser column key: ${column.key}`);
    }
    keys.add(column.key);

    if (!String(column.label || '').trim()) {
      throw new Error(`Unit Browser column ${column.key} must define a label.`);
    }

    if (!Object.values(COLUMN_KIND).includes(column.kind)) {
      throw new Error(`Unit Browser column ${column.key} has an invalid kind.`);
    }

    if (!Object.values(STRUCTURAL_REGION).includes(column.structuralRegion)) {
      throw new Error(`Unit Browser column ${column.key} has an invalid structural region.`);
    }

    if (!Number.isInteger(column.minimumWidthPx) || column.minimumWidthPx <= 0) {
      throw new Error(`Unit Browser column ${column.key} must define a positive integer minimumWidthPx.`);
    }

    if (!['wide', 'standard', 'compact', 'tight', 'actions'].includes(column.spacingProfile)) {
      throw new Error(`Unit Browser column ${column.key} has an invalid spacingProfile.`);
    }

    if (!['natural', 'copy_single_line'].includes(column.valueWrapMode)) {
      throw new Error(`Unit Browser column ${column.key} has an invalid valueWrapMode.`);
    }

    if (!Number.isInteger(column.growthUnits) || column.growthUnits < 0 || column.growthUnits > 2) {
      throw new Error(`Unit Browser column ${column.key} must define growthUnits from 0 through 2.`);
    }

    if (column.kind === COLUMN_KIND.CORE) {
      if (column.structuralRegion === STRUCTURAL_REGION.CONFIGURABLE) {
        throw new Error(`Core Unit Browser column ${column.key} cannot be in the configurable region.`);
      }
      if (column.defaultVisible !== true) {
        throw new Error(`Core Unit Browser column ${column.key} must always be visible.`);
      }
      continue;
    }

    if (column.structuralRegion !== STRUCTURAL_REGION.CONFIGURABLE) {
      throw new Error(`Optional Unit Browser column ${column.key} must be in the configurable region.`);
    }

    if (typeof column.defaultVisible !== 'boolean') {
      throw new Error(`Optional Unit Browser column ${column.key} must define boolean defaultVisible.`);
    }

    if (!Number.isInteger(column.defaultOrder) || column.defaultOrder <= 0) {
      throw new Error(`Optional Unit Browser column ${column.key} must define a positive integer defaultOrder.`);
    }

    if (optionalOrders.has(column.defaultOrder)) {
      throw new Error(`Duplicate Unit Browser optional default order: ${column.defaultOrder}`);
    }
    optionalOrders.add(column.defaultOrder);
  }

  for (const requiredCoreKey of ['unit_weight', 'created_work_assignment', 'identifiers', 'unit_actions']) {
    const definition = registry.find((column) => column.key === requiredCoreKey);
    if (!definition || definition.kind !== COLUMN_KIND.CORE) {
      throw new Error(`Required Unit Browser core column is missing: ${requiredCoreKey}`);
    }
  }

  return true;
}

function getUnitBrowserColumnDefinition(columnKey) {
  return COLUMNS_BY_KEY.get(String(columnKey || '').trim()) || null;
}

function listUnitBrowserCoreColumns() {
  return UNIT_BROWSER_COLUMN_REGISTRY
    .filter((column) => column.kind === COLUMN_KIND.CORE)
    .slice()
    .sort((a, b) => a.structuralOrder - b.structuralOrder);
}

function listUnitBrowserOptionalColumns() {
  return UNIT_BROWSER_COLUMN_REGISTRY
    .filter((column) => column.kind === COLUMN_KIND.OPTIONAL)
    .slice()
    .sort((a, b) => a.defaultOrder - b.defaultOrder);
}

function getApplicationDefaultUnitBrowserLayout() {
  return Object.freeze({
    source: Object.freeze({ type: 'application_default', lotId: null, lotName: null }),
    columns: Object.freeze(listUnitBrowserOptionalColumns().map((column) => Object.freeze({
      key: column.key,
      label: column.label,
      isVisible: column.defaultVisible,
      sortOrder: column.defaultOrder,
      minimumWidthPx: column.minimumWidthPx,
      spacingProfile: column.spacingProfile,
      valueWrapMode: column.valueWrapMode,
      growthUnits: column.growthUnits,
      description: column.description
    })))
  });
}

assertValidUnitBrowserColumnRegistry();

module.exports = {
  COLUMN_KIND,
  STRUCTURAL_REGION,
  MAX_VISIBLE_OPTIONAL_COLUMNS,
  UNIT_BROWSER_COLUMN_REGISTRY,
  assertValidUnitBrowserColumnRegistry,
  getApplicationDefaultUnitBrowserLayout,
  getUnitBrowserColumnDefinition,
  listUnitBrowserCoreColumns,
  listUnitBrowserOptionalColumns
};
