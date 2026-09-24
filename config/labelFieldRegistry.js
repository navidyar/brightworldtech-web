'use strict';

const LABEL_FIELD_GROUPS = Object.freeze([
  Object.freeze({
    code: 'identity',
    label: 'Unit identity',
    fields: Object.freeze([
      Object.freeze({ key: 'unit.asset_tag', label: 'Asset Tag', sampleValue: 'BWT123456' }),
      Object.freeze({ key: 'unit.primary_label', label: 'Primary Label (Asset Tag / Unit #)', sampleValue: 'BWT123456' }),
      Object.freeze({ key: 'unit.unit_id', label: 'Unit ID', sampleValue: '12345' }),
      Object.freeze({ key: 'unit.primary_serial', label: 'Primary Serial', sampleValue: 'MXL20357DP' }),
      Object.freeze({ key: 'unit.unit_serial', label: 'Unit Serial', sampleValue: '5CG1234ABC' }),
      Object.freeze({ key: 'unit.bios_serial', label: 'BIOS / System Serial', sampleValue: 'BIOS1234ABC' }),
      Object.freeze({ key: 'unit.system_uuid', label: 'System UUID', sampleValue: '12345678-ABCD-4EF0-9123-123456789ABC' })
    ])
  }),
  Object.freeze({
    code: 'catalog',
    label: 'Unit catalog / specifications',
    fields: Object.freeze([
      Object.freeze({ key: 'unit.category', label: 'Unit Category', sampleValue: 'Desktop' }),
      Object.freeze({ key: 'unit.manufacturer', label: 'Manufacturer', sampleValue: 'HP' }),
      Object.freeze({ key: 'unit.model', label: 'Model', sampleValue: 'EliteDesk 800 G6' }),
      Object.freeze({ key: 'unit.model_display', label: 'Manufacturer + Model', sampleValue: 'HP EliteDesk 800 G6' }),
      Object.freeze({ key: 'unit.processor', label: 'Processor (Long Form)', sampleValue: 'Intel Core i7-10200U' }),
      Object.freeze({ key: 'unit.processor_short', label: 'Processor (Short Form)', sampleValue: 'Intel Core i7-10th' }),
      Object.freeze({ key: 'unit.ram', label: 'Memory / RAM', sampleValue: '16GB' }),
      Object.freeze({ key: 'unit.storage', label: 'Storage Capacity', sampleValue: '256GB' }),
      Object.freeze({ key: 'unit.operating_system', label: 'Operating System (Long Form)', sampleValue: 'Windows 11 Pro' }),
      Object.freeze({ key: 'unit.operating_system_short', label: 'Operating System (Short Form)', sampleValue: 'Win 11 Pro' }),
      Object.freeze({ key: 'unit.spec_line', label: 'Standard Specification Line', sampleValue: '16GB | 256GB | WIN 11 PRO' })
    ])
  }),
  Object.freeze({
    code: 'lot',
    label: 'Lot',
    fields: Object.freeze([
      Object.freeze({ key: 'lot.name', label: 'Lot Name', sampleValue: '#ARS' })
    ])
  })
]);

const LABEL_FIELDS = Object.freeze(LABEL_FIELD_GROUPS.flatMap((group) => (
  group.fields.map((field) => Object.freeze({ ...field, groupCode: group.code, groupLabel: group.label }))
)));
function findLabelField(key) {
  const normalized = String(key || '').trim();
  return LABEL_FIELDS.find((field) => field.key === normalized) || null;
}

module.exports = {
  LABEL_FIELD_GROUPS,
  LABEL_FIELDS,
  findLabelField
};
